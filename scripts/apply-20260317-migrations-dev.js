require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATIONS = [
  // Migraciones 20260303 que faltaban
  'supabase/migrations/20260303_exec_funnel_9fases_sla_prospectos.sql',
  'supabase/migrations/20260303_exec_conversion_fixes.sql',
  'supabase/migrations/20260303_exec_tendencia_fix.sql',
  'supabase/migrations/20260303_exec_tendencia_granularity.sql',
  'supabase/migrations/20260303_exec_dashboard_cdmx_projection.sql',
  'supabase/migrations/20260303_exec_top_asesores_cdmx.sql',
  // Fixes del 20260317
  'supabase/migrations/20260317_drop_funnel_overload.sql',
  'supabase/migrations/20260317_fix_sla_stats_prospectos.sql',
  'supabase/migrations/20260317_fix_top_asesores.sql',
];

async function main() {
  const client = new Client({ connectionString: process.env.DevDATABASE_URL });
  try {
    await client.connect();
    console.log('🔌 Conectado a DEV\n');

    for (const migration of MIGRATIONS) {
      const sql = fs.readFileSync(path.join(process.cwd(), migration), 'utf-8');
      await client.query(sql);
      console.log(`  ✅ ${migration}`);
    }

    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('\n✅ Schema cache recargado');
    console.log('🎉 Todas las migraciones aplicadas a DEV.');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
