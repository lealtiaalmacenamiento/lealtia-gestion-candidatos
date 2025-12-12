#!/usr/bin/env node
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function analyzeIssues() {
  const dbUrl = process.env.DB_URL || process.env.DevDATABASE_URL || process.env.DATABASE_URL;
  const client = new Client({ connectionString: dbUrl });
  
  try {
    await client.connect();
    console.log('Connected to database\n');

    // 1. Get all SECURITY DEFINER functions without explicit search_path
    console.log('========== SECURITY DEFINER FUNCTIONS WITHOUT search_path ==========');
    const functionsQuery = `
      SELECT 
        n.nspname as schema,
        p.proname as function_name,
        pg_get_function_arguments(p.oid) as arguments,
        CASE p.provolatile
          WHEN 'i' THEN 'IMMUTABLE'
          WHEN 's' THEN 'STABLE'
          WHEN 'v' THEN 'VOLATILE'
        END as volatility,
        CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END as security
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND prosecdef = true
        AND NOT EXISTS (
          SELECT 1 FROM pg_proc p2
          WHERE p2.oid = p.oid
            AND proconfig IS NOT NULL
            AND proconfig::text LIKE '%search_path%'
        )
      ORDER BY p.proname;
    `;
    const funcResult = await client.query(functionsQuery);
    console.log(`Found ${funcResult.rows.length} SECURITY DEFINER functions without search_path:\n`);
    funcResult.rows.forEach(row => {
      console.log(`  - ${row.function_name}(${row.arguments || ''})`);
    });

    // 2. Get tables with RLS policies using auth.uid() without subquery
    console.log('\n========== POLICIES WITH auth.uid() (auth_rls_initplan) ==========');
    const policiesQuery = `
      SELECT 
        schemaname,
        tablename,
        policyname,
        CASE cmd
          WHEN 'r' THEN 'SELECT'
          WHEN 'a' THEN 'INSERT'
          WHEN 'w' THEN 'UPDATE'
          WHEN 'd' THEN 'DELETE'
          WHEN '*' THEN 'ALL'
        END as command,
        qual as using_expression,
        with_check as with_check_expression
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
      ORDER BY tablename, policyname;
    `;
    const policiesResult = await client.query(policiesQuery);
    console.log(`Found ${policiesResult.rows.length} policies with direct auth.uid() calls:\n`);
    policiesResult.rows.forEach(row => {
      console.log(`  - ${row.tablename}.${row.policyname} (${row.command})`);
    });

    // 3. Get unindexed foreign keys
    console.log('\n========== UNINDEXED FOREIGN KEYS ==========');
    const fkeysQuery = `
      SELECT 
        c.conrelid::regclass AS table_name,
        a.attname AS column_name,
        c.confrelid::regclass AS referenced_table
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f'
        AND n.nspname = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND a.attnum = ANY(i.indkey)
        )
      ORDER BY table_name, column_name;
    `;
    const fkeysResult = await client.query(fkeysQuery);
    console.log(`Found ${fkeysResult.rows.length} unindexed foreign keys:\n`);
    fkeysResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}.${row.column_name} → ${row.referenced_table}`);
    });

    // 4. Get tables with multiple permissive policies
    console.log('\n========== TABLES WITH MULTIPLE PERMISSIVE POLICIES ==========');
    const multiPoliciesQuery = `
      SELECT 
        tablename,
        cmd,
        COUNT(*) as policy_count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND permissive = 't'
      GROUP BY tablename, cmd
      HAVING COUNT(*) > 1
      ORDER BY policy_count DESC, tablename;
    `;
    const multiResult = await client.query(multiPoliciesQuery);
    console.log(`Found ${multiResult.rows.length} table/command combinations with multiple policies:\n`);
    multiResult.rows.forEach(row => {
      const cmdMap = { r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE', '*': 'ALL' };
      console.log(`  - ${row.tablename}: ${row.policy_count} ${cmdMap[row.cmd]} policies`);
    });

    // 5. Get unused indexes
    console.log('\n========== POTENTIALLY UNUSED INDEXES ==========');
    const unusedIdxQuery = `
      SELECT 
        schemaname,
        relname as tablename,
        indexrelname as indexname,
        idx_scan,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND idx_scan = 0
        AND indexrelname NOT LIKE '%_pkey'
      ORDER BY pg_relation_size(indexrelid) DESC;
    `;
    const unusedResult = await client.query(unusedIdxQuery);
    console.log(`Found ${unusedResult.rows.length} indexes with 0 scans:\n`);
    unusedResult.rows.forEach(row => {
      console.log(`  - ${row.tablename}.${row.indexname} (${row.index_size})`);
    });

    // 6. Get tables with RLS enabled but no policies
    console.log('\n========== TABLES WITH RLS BUT NO POLICIES ==========');
    const noPoliciesQuery = `
      SELECT 
        t.schemaname,
        t.tablename
      FROM pg_tables t
      WHERE t.schemaname = 'public'
        AND t.rowsecurity = true
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = t.schemaname
            AND p.tablename = t.tablename
        )
      ORDER BY t.tablename;
    `;
    const noPoliciesResult = await client.query(noPoliciesQuery);
    console.log(`Found ${noPoliciesResult.rows.length} tables with RLS but no policies:\n`);
    noPoliciesResult.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

analyzeIssues();
