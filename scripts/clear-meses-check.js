// Limpia el campo meses_check de todas las pólizas en ambas BDs (prod y dev).
// El campo es legacy: fue reemplazado por poliza_pagos_mensuales.
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function clearMesesCheck(label, connectionString) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log(`🔌 Conectado a ${label}`);
    const res = await client.query(`UPDATE polizas SET meses_check = '{}' WHERE meses_check IS NOT NULL AND meses_check != '{}'`);
    console.log(`  ✅ ${res.rowCount} póliza(s) limpiadas en ${label}`);
  } catch (e) {
    console.error(`❌ Error en ${label}:`, e.message);
  } finally {
    await client.end();
  }
}

async function main() {
  await clearMesesCheck('PROD', process.env.MainDATABASE_URL);
  await clearMesesCheck('DEV',  process.env.DevDATABASE_URL);
  console.log('\n🎉 Listo.');
}

main();
