require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const client = new Client({ connectionString: process.env.DevDATABASE_URL });
  try {
    await client.connect();
    console.log('🔌 Conectado a DEV');
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20260331_fix_generar_pagos_dia_pago.sql'),
      'utf-8'
    );
    await client.query(sql);
    console.log('✅ Migración aplicada: 20260331_fix_generar_pagos_dia_pago.sql');
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('✅ Schema cache recargado');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
