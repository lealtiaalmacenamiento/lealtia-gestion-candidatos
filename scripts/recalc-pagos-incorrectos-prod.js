// Recalcula los pagos programados de todas las pólizas EN_VIGOR que tienen
// pagos pendientes con fecha posterior a su fecha_renovacion (PROD).
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function main() {
  const url = process.env.MainDATABASE_URL;
  if (!url) {
    console.error('❌ MainDATABASE_URL no está definida en .env.local');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    console.log('🔌 Conectado a PROD');

    // 1. Re-aplicar la migración para asegurar que la función está actualizada
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20260331_fix_generar_pagos_dia_pago.sql'),
      'utf-8'
    );
    await client.query(sql);
    console.log('✅ Función fn_generar_pagos_programados actualizada');

    // 2. Encontrar pólizas EN_VIGOR con pagos pendientes más allá de fecha_renovacion
    const { rows: polizas } = await client.query(`
      SELECT DISTINCT p.id, p.numero_poliza, p.fecha_renovacion,
             COUNT(ppm.id) AS pagos_incorrectos
      FROM polizas p
      JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
      WHERE p.estatus = 'EN_VIGOR'
        AND ppm.estado = 'pendiente'
        AND p.fecha_renovacion IS NOT NULL
        AND ppm.periodo_mes >= p.fecha_renovacion
      GROUP BY p.id, p.numero_poliza, p.fecha_renovacion
      ORDER BY p.numero_poliza
    `);

    console.log(`\n📋 Pólizas con pagos incorrectos: ${polizas.length}`);
    polizas.forEach(r =>
      console.log(`  - ${r.numero_poliza} | renovación: ${r.fecha_renovacion} | pagos a corregir: ${r.pagos_incorrectos}`)
    );

    if (polizas.length === 0) {
      console.log('✅ No hay pagos incorrectos. Nada que hacer.');
      return;
    }

    // 3. No-op UPDATE en dia_pago para disparar el trigger en cada póliza
    let fixed = 0;
    for (const p of polizas) {
      const result = await client.query(
        `UPDATE polizas SET dia_pago = dia_pago WHERE id = $1`,
        [p.id]
      );
      if (result.rowCount > 0) {
        console.log(`  ✅ Trigger re-disparado: ${p.numero_poliza}`);
        fixed++;
      }
    }

    console.log(`\n✅ ${fixed} pólizas recalculadas.`);
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('✅ Schema cache recargado');

  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
