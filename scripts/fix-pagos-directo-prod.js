// Fix directo de pagos: no depende del trigger.
// Para cada póliza EN_VIGOR con pagos pendientes en fechas incorrectas,
// elimina esos pagos y los regenera directamente con SQL correcto.
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const url = process.env.MainDATABASE_URL;
  if (!url) { console.error('❌ MainDATABASE_URL no definida'); process.exit(1); }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    console.log('🔌 Conectado a PROD\n');

    // 1. Re-aplicar la migración para asegurar función actualizada
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20260331_fix_generar_pagos_dia_pago.sql'),
      'utf-8'
    );
    await client.query(sql);
    console.log('✅ Función fn_generar_pagos_programados re-aplicada\n');

    // 2. Verificar función en DB
    const { rows: fnRows } = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'fn_generar_pagos_programados' LIMIT 1
    `);
    if (fnRows.length > 0) {
      const src = fnRows[0].prosrc;
      console.log('📋 Función en DB:');
      console.log(`   Bug viejo (INTERVAL months): ${src.includes("INTERVAL '1 month' * (CASE WHEN NEW.dia_pago") ? '❌ AÚN PRESENTE' : '✅ Eliminado'}`);
      console.log(`   Fix nuevo (make_interval days): ${src.includes('make_interval(days') ? '✅ Presente' : '❌ NO PRESENTE'}`);
      console.log(`   Guard ANULADA: ${src.includes("NEW.estatus = 'ANULADA'") ? '✅ Presente' : '❌ NO presente'}`);
      console.log();
    }

    // 3. Encontrar TODAS las pólizas EN_VIGOR con pagos pendientes fuera del rango correcto
    const { rows: polizas } = await client.query(`
      SELECT DISTINCT
        p.id,
        p.numero_poliza,
        p.fecha_emision,
        p.fecha_renovacion,
        p.dia_pago,
        p.periodicidad_pago,
        p.prima_mxn,
        MIN(ppm.periodo_mes) AS min_periodo_pendiente,
        MAX(ppm.periodo_mes) AS max_periodo_pendiente,
        COUNT(ppm.id) FILTER (WHERE ppm.estado = 'pendiente') AS n_pendientes
      FROM polizas p
      JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
      WHERE p.estatus = 'EN_VIGOR'
        AND p.fecha_renovacion IS NOT NULL
        AND p.fecha_emision IS NOT NULL
        AND p.dia_pago IS NOT NULL
        AND p.prima_mxn > 0
      GROUP BY p.id, p.numero_poliza, p.fecha_emision, p.fecha_renovacion,
               p.dia_pago, p.periodicidad_pago, p.prima_mxn
      HAVING MAX(ppm.periodo_mes) FILTER (WHERE ppm.estado = 'pendiente') > p.fecha_renovacion
         OR  MIN(ppm.periodo_mes) FILTER (WHERE ppm.estado = 'pendiente') > p.fecha_renovacion
      ORDER BY p.numero_poliza
    `);

    console.log(`📋 Pólizas con pagos fuera de rango: ${polizas.length}`);
    polizas.forEach(r =>
      console.log(`   ${r.numero_poliza} | emisión: ${r.fecha_emision} | renovación: ${r.fecha_renovacion} | dia_pago: ${r.dia_pago} | rango actual: ${r.min_periodo_pendiente} → ${r.max_periodo_pendiente}`)
    );
    console.log();

    if (polizas.length === 0) {
      // Verificar VI0002905797 directamente
      const { rows: direct } = await client.query(`
        SELECT ppm.periodo_mes, ppm.estado, ppm.monto_programado, ppm.fecha_programada
        FROM poliza_pagos_mensuales ppm
        JOIN polizas p ON p.id = ppm.poliza_id
        WHERE p.numero_poliza = 'VI0002905797'
        ORDER BY ppm.periodo_mes
      `);
      console.log(`📅 Pagos VI0002905797 (${direct.length} total):`);
      direct.forEach(r =>
        console.log(`  periodo: ${r.periodo_mes} | ${r.estado} | $${r.monto_programado} | fecha: ${r.fecha_programada}`)
      );
      console.log('\n⚠️  No hay pólizas con HAVING positivo. Forzando fix de VI0002905797...');

      await forceFixPoliza(client, 'VI0002905797');
      return;
    }

    // 4. Fix directo para cada póliza afectada
    for (const p of polizas) {
      await client.query('BEGIN');
      try {
        // 4a. Borrar TODOS los pagos pendientes
        const { rowCount: deleted } = await client.query(
          `DELETE FROM poliza_pagos_mensuales WHERE poliza_id = $1 AND estado = 'pendiente'`,
          [p.id]
        );
        console.log(`  🗑️  ${p.numero_poliza}: ${deleted} pagos pendientes eliminados`);

        // 4b. Calcular divisor según periodicidad
        const divisorMap = { 'M': 12, 'T': 4, 'S': 2, 'A': 1 };
        const divisor = divisorMap[p.periodicidad_pago] || 12;
        const montoPeriodo = Math.round((p.prima_mxn / divisor) * 100) / 100;

        // 4c. Calcular fechas correctas
        // Primer pago = primer dia del mes de emisión + (dia_pago - 1) días
        const fechaEmision = new Date(p.fecha_emision);
        const fechaRenovacion = new Date(p.fecha_renovacion);
        const diaPago = parseInt(p.dia_pago);

        const pagos = [];
        let cursor = new Date(Date.UTC(fechaEmision.getUTCFullYear(), fechaEmision.getUTCMonth(), 1));

        // Avanzar mes a mes hasta fecha_renovacion
        while (cursor <= fechaRenovacion) {
          const year = cursor.getUTCFullYear();
          const month = cursor.getUTCMonth(); // 0-based

          // Calcular fecha_programada: año/mes + dia_pago (clampeado al último día del mes)
          const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
          const dia = Math.min(diaPago, lastDayOfMonth);
          const fechaProgramada = new Date(Date.UTC(year, month, dia));

          // periodo_mes = primer día del mes
          const periodoMes = new Date(Date.UTC(year, month, 1));

          pagos.push({
            periodo_mes: periodoMes.toISOString().slice(0, 10),
            fecha_programada: fechaProgramada.toISOString().slice(0, 10),
            monto_programado: montoPeriodo,
          });

          // Avanzar un mes
          cursor = new Date(Date.UTC(year, month + 1, 1));
        }

        // 4d. Insertar los pagos correctos
        for (const pago of pagos) {
          await client.query(
            `INSERT INTO poliza_pagos_mensuales (poliza_id, periodo_mes, fecha_programada, monto_programado, estado)
             VALUES ($1, $2, $3, $4, 'pendiente')
             ON CONFLICT (poliza_id, periodo_mes) DO UPDATE
               SET fecha_programada = EXCLUDED.fecha_programada,
                   monto_programado  = EXCLUDED.monto_programado,
                   estado            = 'pendiente'`,
            [p.id, pago.periodo_mes, pago.fecha_programada, pago.monto_programado]
          );
        }

        await client.query('COMMIT');
        console.log(`  ✅ ${p.numero_poliza}: ${pagos.length} pagos insertados (rango: ${pagos[0]?.periodo_mes} → ${pagos[pagos.length - 1]?.periodo_mes})`);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error(`  ❌ ${p.numero_poliza}: Error - ${e.message}`);
      }
    }

    // 5. Verificar resultado final de VI0002905797
    await verifyPoliza(client, 'VI0002905797');

    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('\n✅ Listo');
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

async function forceFixPoliza(client, numeroPoliza) {
  const { rows } = await client.query(
    `SELECT id, fecha_emision, fecha_renovacion, dia_pago, periodicidad_pago, prima_mxn
     FROM polizas WHERE numero_poliza = $1`,
    [numeroPoliza]
  );
  if (rows.length === 0) { console.log('❌ Póliza no encontrada'); return; }
  const p = rows[0];
  p.numero_poliza = numeroPoliza;

  // Borrar pendientes incorrectos (los que están fuera del rango emision→renovacion)
  const { rowCount } = await client.query(
    `DELETE FROM poliza_pagos_mensuales
     WHERE poliza_id = $1
       AND estado = 'pendiente'
       AND periodo_mes > $2`,
    [p.id, p.fecha_renovacion]
  );
  console.log(`🗑️  ${rowCount} pagos fuera de rango eliminados para ${numeroPoliza}`);

  // Verificar si ya hay pagos correctos o hay que regenerar todo
  const { rows: existing } = await client.query(
    `SELECT COUNT(*) AS n FROM poliza_pagos_mensuales WHERE poliza_id = $1`,
    [p.id]
  );
  console.log(`   Pagos restantes: ${existing[0].n}`);

  if (parseInt(existing[0].n) === 0) {
    // No hay pagos, disparar trigger
    await client.query(`UPDATE polizas SET dia_pago = $1 WHERE id = $2`, [p.dia_pago, p.id]);
    console.log('🔄 Trigger re-disparado');
  }

  await verifyPoliza(client, numeroPoliza);
}

async function verifyPoliza(client, numeroPoliza) {
  const { rows } = await client.query(`
    SELECT ppm.periodo_mes, ppm.estado, ppm.monto_programado, ppm.fecha_programada
    FROM poliza_pagos_mensuales ppm
    JOIN polizas p ON p.id = ppm.poliza_id
    WHERE p.numero_poliza = $1
    ORDER BY ppm.periodo_mes
  `, [numeroPoliza]);

  console.log(`\n📅 Pagos finales de ${numeroPoliza} (${rows.length} registros):`);
  rows.forEach(r =>
    console.log(`  ${r.periodo_mes} | ${r.estado} | $${r.monto_programado} | ${r.fecha_programada}`)
  );
}

main();
