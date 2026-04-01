/**
 * Aplica fix: normalize_prima UDI usa CURRENT_DATE + recalcula prima_mxn en pólizas UDI
 */
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const connStr = process.env.MainDATABASE_URL;
  if (!connStr) throw new Error('MainDATABASE_URL no definida en .env.local');

  const client = new Client({ connectionString: connStr });
  await client.connect();

  // Verificar UDI actual
  const { rows: udiRow } = await client.query(
    `SELECT valor FROM udi_values WHERE fecha <= CURRENT_DATE ORDER BY fecha DESC LIMIT 1`
  );
  const udiActual = udiRow[0]?.valor;
  console.log(`UDI actual (${new Date().toISOString().slice(0,10)}): ${udiActual} pesos/UDI`);

  // Ver pólizas UDI afectadas antes
  const { rows: polizasAntes } = await client.query(`
    SELECT numero_poliza, prima_input, prima_mxn, prima_moneda, estatus
    FROM polizas WHERE prima_moneda = 'UDI' AND estatus != 'ANULADA'
  `);
  console.log(`\nPólizas UDI activas: ${polizasAntes.length}`);
  polizasAntes.forEach(p => {
    const expected = Math.round(parseFloat(p.prima_input) * udiActual * 100) / 100;
    console.log(`  ${p.numero_poliza}: prima_input=${p.prima_input} UDI | prima_mxn actual=${p.prima_mxn} | debería ser ≈${expected}`);
  });

  // Aplicar migración
  const sql = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20260331_fix_normalize_prima_udi_current_date.sql'),
    'utf8'
  );
  console.log('\nAplicando migración...');
  await client.query(sql);
  console.log('OK');

  // Ver resultado
  const { rows: polizasDespues } = await client.query(`
    SELECT numero_poliza, prima_input, prima_mxn, prima_moneda
    FROM polizas WHERE prima_moneda = 'UDI' AND estatus != 'ANULADA'
  `);
  console.log('\nResultado tras recálculo:');
  polizasDespues.forEach(p => {
    console.log(`  ${p.numero_poliza}: prima_mxn=${p.prima_mxn} (${(p.prima_mxn/12).toFixed(2)}/mes)`);
  });

  // Ver pagos de VI0002905797
  const { rows: pagos } = await client.query(`
    SELECT ppm.periodo_mes, ppm.monto_programado, ppm.fecha_programada
    FROM poliza_pagos_mensuales ppm
    JOIN polizas p ON p.id = ppm.poliza_id
    WHERE p.numero_poliza = 'VI0002905797'
    ORDER BY ppm.periodo_mes
  `);
  console.log('\nCalendario VI0002905797:');
  pagos.forEach(r => console.log(`  ${r.periodo_mes?.toISOString().slice(0,7)} | $${r.monto_programado} | ${r.fecha_programada?.toISOString().slice(0,10)}`));

  await client.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
