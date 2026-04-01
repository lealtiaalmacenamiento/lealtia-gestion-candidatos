/**
 * Aplica fix: normalize_prima UDI usa CURRENT_DATE + recalcula prima_mxn en pólizas UDI (DEV)
 */
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const connStr = process.env.DevDATABASE_URL;
  if (!connStr) throw new Error('DevDATABASE_URL no definida en .env.local');

  const client = new Client({ connectionString: connStr });
  await client.connect();

  const { rows: udiRow } = await client.query(
    `SELECT valor FROM udi_values WHERE fecha <= CURRENT_DATE ORDER BY fecha DESC LIMIT 1`
  );
  const udiActual = udiRow[0]?.valor;
  console.log(`UDI actual (${new Date().toISOString().slice(0,10)}): ${udiActual} pesos/UDI`);

  const { rows: polizasAntes } = await client.query(`
    SELECT numero_poliza, prima_input, prima_mxn, prima_moneda, estatus
    FROM polizas WHERE prima_moneda = 'UDI' AND estatus != 'ANULADA'
  `);
  console.log(`\nPólizas UDI activas: ${polizasAntes.length}`);
  polizasAntes.forEach(p => {
    const expected = Math.round(parseFloat(p.prima_input) * udiActual * 100) / 100;
    console.log(`  ${p.numero_poliza}: prima_input=${p.prima_input} UDI | prima_mxn actual=${p.prima_mxn} | debería ser ≈${expected}`);
  });

  const sql = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20260331_fix_normalize_prima_udi_current_date.sql'),
    'utf8'
  );
  console.log('\nAplicando migración...');
  await client.query(sql);
  console.log('OK');

  const { rows: polizasDespues } = await client.query(`
    SELECT numero_poliza, prima_input, prima_mxn, prima_moneda
    FROM polizas WHERE prima_moneda = 'UDI' AND estatus != 'ANULADA'
  `);
  console.log('\nResultado tras recálculo:');
  polizasDespues.forEach(p => {
    console.log(`  ${p.numero_poliza}: prima_mxn=${p.prima_mxn} (${(p.prima_mxn/12).toFixed(2)}/mes)`);
  });

  await client.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
