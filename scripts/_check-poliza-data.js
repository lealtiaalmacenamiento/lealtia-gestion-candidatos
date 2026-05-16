require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.MainDATABASE_URL });
  await client.connect();

  const { rows: enums } = await client.query(
    'SELECT DISTINCT periodicidad_pago FROM polizas LIMIT 10'
  );
  console.log('Valores periodicidad_pago en DB:', enums.map(r => r.periodicidad_pago));

  const { rows } = await client.query(
    `SELECT numero_poliza, prima_input, prima_mxn, prima_moneda, periodicidad_pago,
            dia_pago, fecha_emision, fecha_renovacion
     FROM polizas WHERE numero_poliza = 'VI0002905797'`
  );
  console.log('\nVI0002905797:', JSON.stringify(rows[0], null, 2));

  // También ver los pagos actuales
  const { rows: pagos } = await client.query(`
    SELECT ppm.periodo_mes, ppm.estado, ppm.monto_programado, ppm.fecha_programada
    FROM poliza_pagos_mensuales ppm
    JOIN polizas p ON p.id = ppm.poliza_id
    WHERE p.numero_poliza = 'VI0002905797'
    ORDER BY ppm.periodo_mes
  `);
  console.log('\nPagos actuales en DB:');
  pagos.forEach(r => console.log(`  ${r.periodo_mes.toISOString().slice(0,7)} | ${r.estado} | $${r.monto_programado} | ${r.fecha_programada}`));

  await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
