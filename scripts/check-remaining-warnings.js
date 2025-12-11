const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const dbUrl = process.env.DB_URL || process.env.DevDATABASE_URL || process.env.DATABASE_URL;
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    console.log('=== CHECKING REMAINING SUPABASE WARNINGS ===\n');

    // 1. Check for direct auth.uid() calls (should all be wrapped)
    const authCheck = await client.query(`
      SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (
          (qual IS NOT NULL AND qual LIKE '%auth.uid()%' AND qual NOT LIKE '%(SELECT auth.uid())%')
          OR (with_check IS NOT NULL AND with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%(SELECT auth.uid())%')
        )
      ORDER BY tablename, policyname
    `);
    
    console.log(`❌ Direct auth.uid() calls (not wrapped in SELECT): ${authCheck.rows.length}`);
    if (authCheck.rows.length > 0) {
      authCheck.rows.forEach(r => {
        console.log(`  - ${r.tablename}.${r.policyname}`);
      });
    } else {
      console.log('  ✅ All auth.uid() calls are properly wrapped');
    }

    // 2. Check for SECURITY DEFINER functions without search_path
    const funcCheck = await client.query(`
      SELECT 
        n.nspname as schema,
        p.proname as function_name,
        pg_get_function_arguments(p.oid) as arguments,
        CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END as security
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND prosecdef = true
        AND (proconfig IS NULL OR NOT proconfig::text LIKE '%search_path%')
      ORDER BY p.proname
    `);
    
    console.log(`\n❌ SECURITY DEFINER functions without search_path: ${funcCheck.rows.length}`);
    if (funcCheck.rows.length > 0) {
      funcCheck.rows.forEach(r => {
        console.log(`  - ${r.function_name}(${r.arguments || ''})`);
      });
    } else {
      console.log('  ✅ All SECURITY DEFINER functions have search_path set');
    }

    // 3. Check for tables with RLS but no policies
    const noPolicies = await client.query(`
      SELECT t.tablename
      FROM pg_tables t
      WHERE t.schemaname = 'public'
        AND t.rowsecurity = true
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = t.schemaname AND p.tablename = t.tablename
        )
      ORDER BY t.tablename
    `);
    
    console.log(`\n❌ Tables with RLS enabled but no policies: ${noPolicies.rows.length}`);
    if (noPolicies.rows.length > 0) {
      noPolicies.rows.forEach(r => {
        console.log(`  - ${r.tablename}`);
      });
    } else {
      console.log('  ✅ All RLS-enabled tables have policies');
    }

    // 4. List all SECURITY DEFINER views
    const secDefViews = await client.query(`
      SELECT 
        n.nspname as schema,
        c.relname as view_name,
        CASE WHEN c.relkind = 'v' THEN 'view' ELSE 'materialized view' END as type
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND c.relkind IN ('v', 'm')
        AND EXISTS (
          SELECT 1 FROM pg_rewrite r
          WHERE r.ev_class = c.oid
            AND r.ev_type = '1'
        )
      ORDER BY c.relname
    `);
    
    console.log(`\n📊 Total views in public schema: ${secDefViews.rows.length}`);
    
    // 5. Check view security settings
    const viewSecurity = await client.query(`
      SELECT 
        schemaname,
        viewname,
        viewowner,
        definition
      FROM pg_views
      WHERE schemaname = 'public'
        AND (definition LIKE '%SECURITY DEFINER%' OR definition LIKE '%security_definer%')
      ORDER BY viewname
    `);
    
    console.log(`\n❌ Views with SECURITY DEFINER: ${viewSecurity.rows.length}`);
    if (viewSecurity.rows.length > 0) {
      viewSecurity.rows.forEach(r => {
        console.log(`  - ${r.viewname} (owner: ${r.viewowner})`);
      });
    } else {
      console.log('  ✅ No views with SECURITY DEFINER found');
    }

    // 6. Check for unindexed foreign keys
    const unindexedFk = await client.query(`
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
      ORDER BY table_name, column_name
    `);
    
    console.log(`\n❌ Unindexed foreign keys: ${unindexedFk.rows.length}`);
    if (unindexedFk.rows.length > 0) {
      unindexedFk.rows.forEach(r => {
        console.log(`  - ${r.table_name}.${r.column_name} → ${r.referenced_table}`);
      });
    } else {
      console.log('  ✅ All foreign keys are indexed');
    }

    console.log('\n=== SUMMARY ===');
    const totalIssues = authCheck.rows.length + funcCheck.rows.length + noPolicies.rows.length + unindexedFk.rows.length + viewSecurity.rows.length;
    console.log(`Total critical issues: ${totalIssues}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
