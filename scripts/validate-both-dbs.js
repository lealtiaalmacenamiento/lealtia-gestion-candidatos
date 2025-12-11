const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function validateBothDatabases() {
  const databases = [
    { name: 'DEV', url: process.env.DevDATABASE_URL },
    { name: 'MAIN (PROD)', url: process.env.MainDATABASE_URL }
  ];

  for (const db of databases) {
    if (!db.url) {
      console.log(`⚠️  ${db.name}: No connection string found\n`);
      continue;
    }

    const client = new Client({ connectionString: db.url });

    try {
      await client.connect();
      console.log(`\n${'='.repeat(60)}`);
      console.log(`${db.name} DATABASE - SECURITY & PERFORMANCE VALIDATION`);
      console.log('='.repeat(60));

      // 1. Function search_path check
      console.log('\n📋 1. FUNCTION SEARCH_PATH CHECK');
      const funcCheck = await client.query(`
        SELECT 
          p.proname as function_name,
          CASE 
            WHEN proconfig IS NOT NULL AND proconfig::text LIKE '%search_path%' THEN 'SET'
            ELSE 'NOT SET'
          END as search_path_status
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND prosecdef = false
          AND p.proname IN (
            'transfer_reassign_usuario', 'generar_cliente_code', 'set_updated_at',
            'producto_parametros_set_keys', 'polizas_before_insupd_enforce_moneda',
            'get_current_udi', 'get_fx_usd', 'normalize_prima', 'recalc_puntos_poliza',
            'submit_cliente_update', 'apply_cliente_update', 'jwt_role',
            'calculate_campaign_datasets_for_user', 'evaluate_all_campaigns'
          )
        ORDER BY p.proname
      `);
      
      const notSet = funcCheck.rows.filter(r => r.search_path_status === 'NOT SET');
      console.log(`   Total functions checked: ${funcCheck.rows.length}`);
      console.log(`   ✅ With search_path: ${funcCheck.rows.length - notSet.length}`);
      console.log(`   ❌ Without search_path: ${notSet.length}`);
      if (notSet.length > 0) {
        notSet.forEach(f => console.log(`      - ${f.function_name}`));
      }

      // 2. RLS Status
      console.log('\n📋 2. ROW LEVEL SECURITY (RLS) STATUS');
      const rlsCheck = await client.query(`
        SELECT 
          t.tablename,
          t.rowsecurity as rls_enabled,
          COUNT(p.policyname) as policy_count
        FROM pg_tables t
        LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
        WHERE t.schemaname = 'public'
        GROUP BY t.tablename, t.rowsecurity
        HAVING t.rowsecurity = true
        ORDER BY policy_count ASC, t.tablename
        LIMIT 30
      `);
      
      const noPolicies = rlsCheck.rows.filter(r => r.policy_count === 0);
      console.log(`   Tables with RLS enabled: ${rlsCheck.rows.length}`);
      console.log(`   ✅ With policies: ${rlsCheck.rows.length - noPolicies.length}`);
      console.log(`   ❌ Without policies: ${noPolicies.length}`);
      if (noPolicies.length > 0) {
        noPolicies.forEach(t => console.log(`      - ${t.tablename}`));
      }

      // 3. Unindexed Foreign Keys
      console.log('\n📋 3. UNINDEXED FOREIGN KEYS');
      const fkCheck = await client.query(`
        SELECT 
          c.conrelid::regclass AS table_name,
          a.attname AS column_name
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
        ORDER BY table_name
      `);
      
      console.log(`   Unindexed foreign keys: ${fkCheck.rows.length}`);
      if (fkCheck.rows.length > 0) {
        console.log('   ❌ Missing indexes:');
        fkCheck.rows.forEach(fk => {
          console.log(`      - ${fk.table_name}.${fk.column_name}`);
        });
      } else {
        console.log('   ✅ All foreign keys are indexed');
      }

      // 4. Security Definer Views
      console.log('\n📋 4. SECURITY DEFINER VIEWS');
      const viewCheck = await client.query(`
        SELECT 
          schemaname,
          viewname
        FROM pg_views
        WHERE schemaname = 'public'
          AND (definition LIKE '%SECURITY DEFINER%' OR definition LIKE '%security_definer%')
      `);
      
      console.log(`   Views with SECURITY DEFINER: ${viewCheck.rows.length}`);
      if (viewCheck.rows.length > 0) {
        console.log('   ⚠️  Found:');
        viewCheck.rows.forEach(v => console.log(`      - ${v.viewname}`));
      } else {
        console.log('   ✅ No SECURITY DEFINER views found');
      }

      // 5. auth.uid() optimization check
      console.log('\n📋 5. AUTH.UID() OPTIMIZATION CHECK');
      const authCheck = await client.query(`
        SELECT 
          tablename,
          policyname,
          CASE 
            WHEN qual LIKE '%( SELECT auth.uid()%' OR qual LIKE '%(SELECT auth.uid()%' THEN 'OPTIMIZED'
            WHEN qual LIKE '%auth.uid()%' THEN 'NOT OPTIMIZED'
            ELSE 'NO AUTH.UID'
          END as status
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
        ORDER BY status, tablename
        LIMIT 10
      `);
      
      const notOptimized = authCheck.rows.filter(r => r.status === 'NOT OPTIMIZED');
      console.log(`   Policies with auth.uid(): ${authCheck.rows.length}`);
      console.log(`   ✅ Optimized (wrapped): ${authCheck.rows.filter(r => r.status === 'OPTIMIZED').length}`);
      console.log(`   ❌ Not optimized: ${notOptimized.length}`);
      if (notOptimized.length > 0) {
        notOptimized.forEach(p => {
          console.log(`      - ${p.tablename}.${p.policyname}`);
        });
      }

      // 6. Summary
      console.log('\n📊 SUMMARY');
      const totalIssues = notSet.length + noPolicies.length + fkCheck.rows.length + viewCheck.rows.length + notOptimized.length;
      console.log(`   Total critical issues: ${totalIssues}`);
      
      if (totalIssues === 0) {
        console.log('   ✅ All critical security and performance checks passed!');
      } else {
        console.log('   ⚠️  Issues found - review details above');
      }

    } catch (error) {
      console.error(`\n❌ Error connecting to ${db.name}:`, error.message);
    } finally {
      await client.end();
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION COMPLETE');
  console.log('='.repeat(60) + '\n');
}

validateBothDatabases();
