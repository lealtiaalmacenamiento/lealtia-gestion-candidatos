const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const dbUrl = process.env.DB_URL || process.env.DevDATABASE_URL || process.env.DATABASE_URL;
  
  const client = new Client({
    connectionString: dbUrl
  });

  try {
    await client.connect();
    
    console.log('\n========== RLS STATUS ==========');
    const rlsResult = await client.query(`
      SELECT schemaname, tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public'
      AND tablename IN (
        'campaigns_custom_metrics',
        'usuarios',
        'tokens_integracion',
        'agente_meta',
        'prospectos',
        'logs_integracion',
        'registro_acciones',
        'planificaciones',
        'citas',
        'Parametros',
        'prospectos_historial'
      )
      ORDER BY tablename
    `);
    
    rlsResult.rows.forEach(row => {
      const status = row.rowsecurity ? '✅ ENABLED' : '❌ DISABLED';
      console.log(`  ${row.tablename}: ${status}`);
    });
    
    console.log('\n========== POLICIES COUNT ==========');
    const policiesResult = await client.query(`
      SELECT tablename, COUNT(*) as policy_count
      FROM pg_policies
      WHERE schemaname = 'public'
      AND tablename IN (
        'campaigns_custom_metrics',
        'usuarios',
        'tokens_integracion',
        'agente_meta',
        'prospectos',
        'logs_integracion',
        'registro_acciones',
        'planificaciones',
        'citas',
        'Parametros',
        'prospectos_historial'
      )
      GROUP BY tablename
      ORDER BY tablename
    `);
    
    policiesResult.rows.forEach(row => {
      console.log(`  ${row.tablename}: ${row.policy_count} policies`);
    });
    
    console.log('\n========== NEW INDEXES ==========');
    const indexesResult = await client.query(`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN (
        'campaigns_custom_metrics',
        'usuarios',
        'tokens_integracion',
        'agente_meta',
        'prospectos',
        'logs_integracion'
      )
      AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname
    `);
    
    indexesResult.rows.forEach(row => {
      console.log(`  ${row.tablename}.${row.indexname}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
