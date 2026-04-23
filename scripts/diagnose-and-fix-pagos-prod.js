// Diagnóstico y fix directo de pagos incorrectos en PROD.
// 1. Verifica si la función fn_generar_pagos_programados está actualizada.
// 2. Si no, la reemplaza.
// 3. Elimina directamente los pagos pendientes con fecha incorrecta (>= fecha_renovacion).
// 4. Regenera pagos correctos directamente en SQL (sin depender del trigger).
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const url = process.env.MainDATABASE_URL;
  if (!url) {
    console.error('❌ MainDATABASE_URL no está definida en .env.local');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    console.log('🔌 Conectado a PROD\n');

    // ─────────────────────────────────────────────────────────
    // 1. DIAGNÓSTICO: ¿Qué versión de la función hay en PROD?
    // ─────────────────────────────────────────────────────────
    const { rows: fnRows } = await client.query(`
      SELECT prosrc
      FROM pg_proc
      WHERE proname = 'fn_generar_pagos_programados'
      LIMIT 1
    `);

    if (fnRows.length === 0) {
      console.log('⚠️  Función fn_generar_pagos_programados no encontrada en DB');
    } else {
      const src = fnRows[0].prosrc;
      const hasOldBug = src.includes("INTERVAL '1 month' * (CASE WHEN NEW.dia_pago");
      const hasNewFix = src.includes('make_interval(days');
      console.log('📋 Estado de la función en PROD:');
      console.log(`   Versión VIEJA (bug): ${hasOldBug ? '✅ SÍ (BUG ACTIVO)' : '❌ No'}`);
      console.log(`   Versión NUEVA (fix): ${hasNewFix ? '✅ Sí' : '❌ No (no aplicada)'}`);
      console.log();
    }

    // ─────────────────────────────────────────────────────────
    // 2. Re-aplicar la migración (siempre, para asegurar)
    // ─────────────────────────────────────────────────────────
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20260331_fix_generar_pagos_dia_pago.sql'),
      'utf-8'
    );
    await client.query(sql);
    console.log('✅ Función fn_generar_pagos_programados y trigger re-aplicados\n');

    // ─────────────────────────────────────────────────────────
    // 3. Verificar pagos incorrectos actuales
    // ─────────────────────────────────────────────────────────
    const { rows: polizasIncorrectas } = await client.query(`
      SELECT DISTINCT p.id, p.numero_poliza, p.fecha_emision, p.fecha_renovacion,
             p.dia_pago, p.periodicidad_pago, p.prima_mxn, p.estatus,
             COUNT(ppm.id) AS pagos_pendientes_incorrectos,
             MIN(ppm.periodo_mes) AS primer_pago_incorrecto
      FROM polizas p
      JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
      WHERE p.estatus = 'EN_VIGOR'
        AND ppm.estado = 'pendiente'
        AND p.fecha_renovacion IS NOT NULL
        AND ppm.periodo_mes >= p.fecha_renovacion
      GROUP BY p.id, p.numero_poliza, p.fecha_emision, p.fecha_renovacion,
               p.dia_pago, p.periodicidad_pago, p.prima_mxn, p.estatus
      ORDER BY p.numero_poliza
    `);

    console.log(`📋 Pólizas con pagos pendientes más allá de fecha_renovacion: ${polizasIncorrectas.length}`);
    polizasIncorrectas.forEach(r =>
      console.log(`   ${r.numero_poliza} | renovación: ${r.fecha_renovacion} | primer pago incorrecto: ${r.primer_pago_incorrecto} | pagos a borrar: ${r.pagos_pendientes_incorrectos}`)
    );
    console.log();

    if (polizasIncorrectas.length === 0) {
      // Verificar también pólizas con TODOS sus pagos en fechas incorrectas
      // (donde todos los pagos pendientes son futuros respecto a la renovación)
      const { rows: todas } = await client.query(`
        SELECT DISTINCT p.id, p.numero_poliza, p.fecha_emision, p.fecha_renovacion,
               p.dia_pago, p.periodicidad_pago, p.prima_mxn, p.estatus,
               COUNT(ppm.id) AS total_pendientes,
               MIN(ppm.periodo_mes) AS min_periodo,
               MAX(ppm.periodo_mes) AS max_periodo
        FROM polizas p
        JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
        WHERE p.estatus = 'EN_VIGOR'
          AND ppm.estado = 'pendiente'
        GROUP BY p.id, p.numero_poliza, p.fecha_emision, p.fecha_renovacion,
                 p.dia_pago, p.periodicidad_pago, p.prima_mxn, p.estatus
        HAVING MIN(ppm.periodo_mes) > p.fecha_emision + interval '2 years'
        ORDER BY p.numero_poliza
      `);
      console.log(`📋 Pólizas con pagos pendientes > 2 años después de emisión: ${todas.length}`);
      todas.forEach(r =>
        console.log(`   ${r.numero_poliza} | emisión: ${r.fecha_emision} | renovación: ${r.fecha_renovacion} | rango pagos: ${r.min_periodo} → ${r.max_periodo}`)
      );
      console.log();
    }

    // ─────────────────────────────────────────────────────────
    // 4. Fix directo: DELETE + trigger refresh para todas las pólizas afectadas
    // ─────────────────────────────────────────────────────────

    // Obtener TODAS las pólizas EN_VIGOR con pagos sospechosos (> 2 años tras emisión)
    const { rows: polizasAfectadas } = await client.query(`
      SELECT DISTINCT p.id, p.numero_poliza, p.fecha_emision, p.fecha_renovacion,
             p.dia_pago, p.periodicidad_pago, p.prima_mxn, p.estatus
      FROM polizas p
      JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
      WHERE p.estatus = 'EN_VIGOR'
        AND ppm.estado = 'pendiente'
        AND p.fecha_emision IS NOT NULL
      GROUP BY p.id, p.numero_poliza, p.fecha_emision, p.fecha_renovacion,
               p.dia_pago, p.periodicidad_pago, p.prima_mxn, p.estatus
      HAVING MIN(ppm.periodo_mes) > p.fecha_emision + interval '1 year'
      ORDER BY p.numero_poliza
    `);

    console.log(`🔧 Pólizas a corregir (pagos pendientes con más de 1 año de desplazamiento): ${polizasAfectadas.length}`);
    polizasAfectadas.forEach(r =>
      console.log(`   ${r.numero_poliza} | dia_pago: ${r.dia_pago} | emisión: ${r.fecha_emision} | renovación: ${r.fecha_renovacion}`)
    );
    console.log();

    if (polizasAfectadas.length === 0) {
      console.log('✅ No se encontraron pólizas con pagos incorrectos. Verificando VI0002905797 directamente...');
      const { rows: direct } = await client.query(`
        SELECT ppm.periodo_mes, ppm.estado, ppm.monto_programado, ppm.fecha_programada
        FROM poliza_pagos_mensuales ppm
        JOIN polizas p ON p.id = ppm.poliza_id
        WHERE p.numero_poliza = 'VI0002905797'
        ORDER BY ppm.periodo_mes
        LIMIT 15
      `);
      console.log(`Pagos actuales de VI0002905797 (${direct.length} registros):`);
      direct.forEach(r => console.log(`  periodo: ${r.periodo_mes} | estado: ${r.estado} | monto: ${r.monto_programado} | fecha_prog: ${r.fecha_programada}`));
      return;
    }

    // Paso 4a: Eliminar TODOS los pagos pendientes de las pólizas afectadas
    let deleted = 0;
    for (const p of polizasAfectadas) {
      const { rowCount } = await client.query(
        `DELETE FROM poliza_pagos_mensuales WHERE poliza_id = $1 AND estado = 'pendiente'`,
        [p.id]
      );
      console.log(`  🗑️  ${p.numero_poliza}: ${rowCount} pagos pendientes eliminados`);
      deleted += rowCount || 0;
    }
    console.log(`\n✅ Total pagos eliminados: ${deleted}\n`);

    // Paso 4b: Disparar el trigger con un update real en fecha_emision (mismo valor)
    // Esto fuerza que el trigger AFTER UPDATE OF fecha_emision se dispare
    let triggered = 0;
    for (const p of polizasAfectadas) {
      const { rowCount } = await client.query(
        `UPDATE polizas SET fecha_emision = fecha_emision WHERE id = $1`,
        [p.id]
      );
      if (rowCount > 0) {
        console.log(`  🔄 Trigger re-disparado: ${p.numero_poliza}`);
        triggered++;
      }
    }
    console.log(`\n✅ ${triggered} triggers re-disparados\n`);

    // ─────────────────────────────────────────────────────────
    // 5. Verificar resultado
    // ─────────────────────────────────────────────────────────
    const { rows: resultado } = await client.query(`
      SELECT ppm.periodo_mes, ppm.estado, ppm.monto_programado, ppm.fecha_programada
      FROM poliza_pagos_mensuales ppm
      JOIN polizas p ON p.id = ppm.poliza_id
      WHERE p.numero_poliza = 'VI0002905797'
      ORDER BY ppm.periodo_mes
      LIMIT 15
    `);

    console.log(`\n📅 Pagos de VI0002905797 después del fix (${resultado.length} registros):`);
    resultado.forEach(r =>
      console.log(`  periodo: ${r.periodo_mes} | estado: ${r.estado} | monto: $${r.monto_programado} | fecha_prog: ${r.fecha_programada}`)
    );

    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('\n✅ Schema cache recargado');

  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
