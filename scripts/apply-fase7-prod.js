/**
 * Aplica las migraciones de Fase 7 (SendPilot + Cal.com) a PRODUCCIÓN.
 * Usa: MainDATABASE_URL de .env.local
 *
 * Orden de aplicación (dependencias de FK):
 *   1. 20260511_fase7_sp_automatizacion.sql   — tablas SP + amplía constraint tokens_integracion
 *   2. 20260601_sp_secuencia_pasos.sql         — tabla sp_secuencia_pasos + col sp_sender_ids + dedup
 *   3. 20260602_sp_precandidatos_existe_en_sp.sql — col existe_en_sp
 *   4. 20260609_sp_secuencia_terminada.sql     — col sp_secuencia_terminada
 *   5. 20260609b_sp_precandidatos_slug_unique.sql — unique (campana_id, linkedin_slug) con dedup
 */
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATIONS = [
  'supabase/migrations/20260511_fase7_sp_automatizacion.sql',
  'supabase/migrations/20260601_sp_secuencia_pasos.sql',
  'supabase/migrations/20260602_sp_precandidatos_existe_en_sp.sql',
  'supabase/migrations/20260609_sp_secuencia_terminada.sql',
  'supabase/migrations/20260609b_sp_precandidatos_slug_unique.sql',
];

async function main() {
  const dbUrl = process.env.MainDATABASE_URL;
  if (!dbUrl) {
    console.error('❌ MainDATABASE_URL no encontrado en .env.local');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 15000 });

  try {
    await client.connect();
    console.log('🔌 Conectado a PRODUCCIÓN\n');

    // Pre-check: which SP tables already exist
    const { rows: existing } = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'sp_%' ORDER BY table_name"
    );
    if (existing.length) {
      console.log('ℹ️  Tablas SP ya existentes:', existing.map(r => r.table_name).join(', '));
    } else {
      console.log('ℹ️  No hay tablas SP en PROD — se aplicarán todas las migraciones');
    }
    console.log('');

    for (const migration of MIGRATIONS) {
      const filePath = path.join(process.cwd(), migration);
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Archivo no encontrado: ${migration}`);
        process.exit(1);
      }
      const sql = fs.readFileSync(filePath, 'utf-8');
      try {
        await client.query(sql);
        console.log(`  ✅ ${migration}`);
      } catch (err) {
        console.error(`  ❌ ${migration}\n     ${err.message}`);
        process.exit(1);
      }
    }

    // Reload PostgREST schema cache
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('\n✅ Schema cache recargado');
    console.log('🎉 Todas las migraciones de Fase 7 aplicadas a PRODUCCIÓN.');

    // Post-check
    const { rows: created } = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'sp_%' ORDER BY table_name"
    );
    console.log('\n📋 Tablas SP en PROD ahora:', created.map(r => r.table_name).join(', '));
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
