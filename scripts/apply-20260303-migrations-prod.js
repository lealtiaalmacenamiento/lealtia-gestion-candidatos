/**
 * Aplica las migraciones del executive dashboard (20260303) a PRODUCCIÓN.
 * Uso: node scripts/apply-20260303-migrations-prod.js
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const MIGRATIONS = [
  'supabase/migrations/20260303_exec_funnel_9fases_sla_prospectos.sql',
  'supabase/migrations/20260303_exec_conversion_fixes.sql',
  'supabase/migrations/20260303_exec_tendencia_fix.sql',
  'supabase/migrations/20260303_exec_tendencia_granularity.sql',
  'supabase/migrations/20260303_exec_dashboard_cdmx_projection.sql',
  'supabase/migrations/20260303_exec_top_asesores_cdmx.sql',
];

async function applyMigration(client, migrationFile) {
  const fullPath = path.join(process.cwd(), migrationFile);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Archivo no encontrado: ${fullPath}`);
  }
  const sql = fs.readFileSync(fullPath, 'utf-8');
  await client.query(sql);
  console.log(`  ✅ ${migrationFile}`);
}

async function main() {
  const dbUrl = process.env.MainDATABASE_URL;
  if (!dbUrl) {
    console.error('❌ ERROR: MainDATABASE_URL no encontrado en .env.local');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    console.log('🔌 Conectado a PRODUCCIÓN\n');
    console.log('📦 Aplicando migraciones executive dashboard (20260303)...\n');

    for (const migration of MIGRATIONS) {
      await applyMigration(client, migration);
    }

    console.log('\n🎉 Todas las migraciones aplicadas exitosamente.');
    console.log('ℹ️  Recuerda recargar el schema cache de PostgREST si es necesario.');
  } catch (err) {
    console.error('\n❌ Error al aplicar migración:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
