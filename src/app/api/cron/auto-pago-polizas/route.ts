/**
 * POST /api/cron/auto-pago-polizas
 *
 * Marca como 'pagado' los pagos pendientes/vencidos de pólizas con auto_pago=true
 * cuya fecha_programada ya llegó o pasó.
 *
 * Invocado desde GitHub Actions con:
 *   x-cron-secret: $REPORTES_CRON_SECRET
 *
 * Response: { success, polizas_procesadas, pagos_marcados, timestamp }
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'

type PagoRow = {
  id: number
  poliza_id: string
  periodo_mes: string
  monto_programado: number | null
  estado: string
}

export async function POST(request: Request) {
  // Validar secret — acepta x-cron-secret o Authorization: Bearer
  const authHeader = request.headers.get('authorization')
  const cronHeader = request.headers.get('x-cron-secret')
  const secret = process.env.REPORTES_CRON_SECRET || process.env.CRON_SECRET

  const validBearer = secret && authHeader === `Bearer ${secret}`
  const validCron   = secret && cronHeader === secret

  if (!validBearer && !validCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceClient()
    const ahora = new Date().toISOString()

    // Obtener pólizas con auto_pago activo
    const { data: polizas, error: polizasErr } = await supabase
      .from('polizas')
      .select('id')
      .eq('auto_pago', true)
      .eq('estatus', 'EN_VIGOR')

    if (polizasErr) {
      console.error('[cron/auto-pago-polizas] Error consultando polizas:', polizasErr)
      return NextResponse.json({ success: false, error: polizasErr.message }, { status: 500 })
    }

    if (!polizas || polizas.length === 0) {
      return NextResponse.json({
        success: true,
        polizas_procesadas: 0,
        pagos_marcados: 0,
        timestamp: ahora,
        message: 'No hay pólizas con auto_pago activo',
      })
    }

    const polizaIds = polizas.map((p: { id: string }) => p.id)

    // Obtener pagos pendientes/vencidos con fecha_programada <= hoy
    const { data: pagos, error: pagosErr } = await supabase
      .from('poliza_pagos_mensuales')
      .select('id, poliza_id, periodo_mes, monto_programado, estado')
      .in('poliza_id', polizaIds)
      .in('estado', ['pendiente', 'vencido'])
      .lte('fecha_programada', ahora.slice(0, 10)) // comparar solo fecha

    if (pagosErr) {
      console.error('[cron/auto-pago-polizas] Error consultando pagos:', pagosErr)
      return NextResponse.json({ success: false, error: pagosErr.message }, { status: 500 })
    }

    if (!pagos || pagos.length === 0) {
      return NextResponse.json({
        success: true,
        polizas_procesadas: polizaIds.length,
        pagos_marcados: 0,
        timestamp: ahora,
        message: 'Sin pagos pendientes que marcar',
      })
    }

    // Marcar cada pago como pagado con monto_programado y fecha actual
    let pagos_marcados = 0
    const errores: { id: number; error: string }[] = []

    for (const pago of pagos as unknown as PagoRow[]) {
      const { error: updateErr } = await supabase
        .from('poliza_pagos_mensuales')
        .update({
          estado: 'pagado',
          monto_pagado: pago.monto_programado,
          fecha_pago_real: ahora,
          notas: 'Registrado automáticamente por auto-pago',
          updated_at: ahora,
        })
        .eq('id', pago.id)

      if (updateErr) {
        errores.push({ id: pago.id, error: updateErr.message })
        continue
      }
      pagos_marcados++
    }

    void logAccion('cron_auto_pago_polizas', {
      tabla_afectada: 'poliza_pagos_mensuales',
      snapshot: {
        polizas_procesadas: polizaIds.length,
        pagos_marcados,
        errores_count: errores.length,
      }
    })

    console.log(`[cron/auto-pago-polizas] ✅ Pólizas procesadas: ${polizaIds.length}, Pagos marcados: ${pagos_marcados}`)
    if (errores.length > 0) {
      console.warn('[cron/auto-pago-polizas] Errores:', errores)
    }

    return NextResponse.json({
      success: true,
      polizas_procesadas: polizaIds.length,
      pagos_marcados,
      errores_count: errores.length,
      timestamp: ahora,
      message: `${pagos_marcados} pago(s) marcado(s) automáticamente`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[cron/auto-pago-polizas] Error:', message)
    return NextResponse.json({ success: false, error: message, timestamp: new Date().toISOString() }, { status: 500 })
  }
}
