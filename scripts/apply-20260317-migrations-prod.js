require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATIONS = [
  'supabase/migrations/20260317_drop_funnel_overload.sql',
  'supabase/migrations/20260317_fix_sla_stats_prospectos.sql',
  'supabase/migrations/20260317_fix_top_asesores.sql',
];

async function main() {
  const dbUrl = process.env.MainDATABASE_URL;
  if (!dbUrl) { console.error('❌ MainDATABASE_URL no encontrado en .env.local'); process.exit(1); }

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log('🔌 Conectado a PRODUCCIÓN\n');

    for (const migration of MIGRATIONS) {
      const sql = fs.readFileSync(path.join(process.cwd(), migration), 'utf-8');
      await client.query(sql);
      console.log(`  ✅ ${migration}`);
    }

    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('\n✅ Schema cache recargado');
    console.log('🎉 Migraciones 20260317 aplicadas a PRODUCCIÓN.');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
