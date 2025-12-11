const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({ connectionString: process.env.DevDATABASE_URL });

  try {
    await client.connect();
    console.log('=== DETAILED SUPABASE LINT CHECKS ===\n');

    // 1. Check auth_rls_initplan pattern more accurately
    console.log('1. Checking auth_rls_initplan pattern...');
    const initplanCheck = await client.query(`
      SELECT 
        tablename,
        policyname,
        CASE 
          WHEN qual LIKE '%auth.uid()%' AND qual NOT LIKE '%SELECT%auth.uid()%' THEN 'USING needs subquery'
          WHEN with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%SELECT%auth.uid()%' THEN 'WITH CHECK needs subquery'
          ELSE 'OK'
        END as status,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (
          (qual LIKE '%auth.uid()%' AND qual NOT LIKE '%SELECT%auth.uid()%')
          OR (with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%SELECT%auth.uid()%')
        )
      LIMIT 5
    `);
    
    console.log(`   Found ${initplanCheck.rows.length} potential auth_rls_initplan issues`);
    if (initplanCheck.rows.length > 0) {
      initplanCheck.rows.forEach(r => {
        console.log(`   - ${r.tablename}.${r.policyname}: ${r.status}`);
      });
    }

    // 2. Check for mutable functions in policies
    console.log('\n2. Checking for mutable/volatile functions in RLS policies...');
    const volatileCheck = await client.query(`
      SELECT DISTINCT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (
          qual LIKE '%now()%' 
          OR qual LIKE '%current_timestamp%'
          OR qual LIKE '%random()%'
          OR with_check LIKE '%now()%'
          OR with_check LIKE '%current_timestamp%'
          OR with_check LIKE '%random()%'
        )
      LIMIT 10
    `);
    
    console.log(`   Found ${volatileCheck.rows.length} policies with volatile functions`);
    
    // 3. Check for inefficient policy patterns
    console.log('\n3. Checking for potentially inefficient patterns...');
    const inefficientCheck = await client.query(`
      SELECT tablename, policyname, length(qual) as qual_length
      FROM pg_policies
      WHERE schemaname = 'public'
        AND length(qual) > 500
      ORDER BY length(qual) DESC
      LIMIT 5
    `);
    
    console.log(`   Found ${inefficientCheck.rows.length} complex policies (>500 chars)`);
    if (inefficientCheck.rows.length > 0) {
      inefficientCheck.rows.forEach(r => {
        console.log(`   - ${r.tablename}.${r.policyname}: ${r.qual_length} chars`);
      });
    }

    // 4. Check for tables without primary keys
    console.log('\n4. Checking for tables without primary keys...');
    const noPkCheck = await client.query(`
      SELECT t.tablename
      FROM pg_tables t
      WHERE t.schemaname = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          WHERE c.conrelid = (t.schemaname || '.' || t.tablename)::regclass
            AND c.contype = 'p'
        )
      ORDER BY t.tablename
    `);
    
    console.log(`   Found ${noPkCheck.rows.length} tables without PK`);
    if (noPkCheck.rows.length > 0 && noPkCheck.rows.length < 10) {
      noPkCheck.rows.forEach(r => {
        console.log(`   - ${r.tablename}`);
      });
    }

    // 5. Check for public schema permissions
    console.log('\n5. Checking schema permissions...');
    const schemaPerms = await client.query(`
      SELECT 
        nspname,
        nspowner::regrole as owner,
        has_schema_privilege('anon', nspname, 'USAGE') as anon_usage,
        has_schema_privilege('authenticated', nspname, 'USAGE') as auth_usage
      FROM pg_namespace
      WHERE nspname = 'public'
    `);
    
    if (schemaPerms.rows.length > 0) {
      const r = schemaPerms.rows[0];
      console.log(`   Schema: ${r.nspname}`);
      console.log(`   Owner: ${r.owner}`);
      console.log(`   Anon can use: ${r.anon_usage}`);
      console.log(`   Authenticated can use: ${r.auth_usage}`);
    }

    // 6. List all RLS enabled tables and policy count
    console.log('\n6. RLS Status Summary...');
    const rlsStatus = await client.query(`
      SELECT 
        t.tablename,
        t.rowsecurity as rls_enabled,
        COUNT(p.policyname) as policy_count
      FROM pg_tables t
      LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
      WHERE t.schemaname = 'public'
        AND t.rowsecurity = true
      GROUP BY t.tablename, t.rowsecurity
      ORDER BY policy_count ASC, t.tablename
      LIMIT 20
    `);
    
    console.log(`   Total RLS-enabled tables: ${rlsStatus.rows.length}`);
    const lowPolicyCount = rlsStatus.rows.filter(r => r.policy_count < 4);
    if (lowPolicyCount.length > 0) {
      console.log(`\n   Tables with < 4 policies:`);
      lowPolicyCount.forEach(r => {
        console.log(`   - ${r.tablename}: ${r.policy_count} policies`);
      });
    }

    console.log('\n=== END OF CHECKS ===');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
