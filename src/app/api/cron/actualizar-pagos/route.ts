/**
 * POST /api/cron/actualizar-pagos
 *
 * Marca como 'vencido' los pagos pendientes cuya fecha_limite ya pasó
 * y genera notificaciones in-app agrupadas por asesor.
 *
 * Invocado desde GitHub Actions con:
 *   Authorization: Bearer $REPORTES_CRON_SECRET
 */

import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type PagoVencidoRow = {
  id: number
  poliza_id: string
  periodo_mes: string
  monto_programado: number | null
  fecha_limite: string
  polizas: {
    numero_poliza: string | null
    asesor_id: string | null
    clientes: { nombre_completo: string | null } | null
  } | null
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  // Validar secret — acepta Authorization: Bearer o x-cron-secret
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

    // 1. Actualizar pagos vencidos mediante función SQL
    const { data, error } = await supabase.rpc('fn_actualizar_pagos_vencidos')
    if (error) {
      console.error('[cron/actualizar-pagos] RPC error:', error)
      return NextResponse.json(
        { success: false, error: error.message, timestamp: new Date().toISOString() },
        { status: 500 }
      )
    }

    const updatedCount: number = (data as { updated_count?: number }[])?.[0]?.updated_count ?? 0
    console.log(`[cron/actualizar-pagos] ✅ Pagos actualizados: ${updatedCount}`)

    // 2. Generar notificaciones in-app si hubo cambios
    let notificacionesCreadas = 0
    if (updatedCount > 0) {
      notificacionesCreadas = await generarNotificaciones(supabase)
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      notificaciones_creadas: notificacionesCreadas,
      timestamp: new Date().toISOString(),
      message: `${updatedCount} pago(s) marcado(s) como vencido(s), ${notificacionesCreadas} notificación(es) enviada(s)`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[cron/actualizar-pagos] Error:', message)
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Auxiliar: notificaciones agrupadas por asesor
// ---------------------------------------------------------------------------
async function generarNotificaciones(supabase: ReturnType<typeof getServiceClient>): Promise<number> {
  try {
    const hoyInicio = new Date()
    hoyInicio.setHours(0, 0, 0, 0)

    const { data: pagosVencidos, error } = await supabase
      .from('poliza_pagos_mensuales')
      .select(
        `id, poliza_id, periodo_mes, monto_programado, fecha_limite,
         polizas!inner(numero_poliza, asesor_id, clientes!inner(nombre_completo))`
      )
      .eq('estado', 'vencido')
      .gte('updated_at', hoyInicio.toISOString())

    if (error || !pagosVencidos || pagosVencidos.length === 0) {
      console.log('[cron/actualizar-pagos] No hay pagos vencidos nuevos para notificar')
      return 0
    }

    // Agrupar por asesor
    const porAsesor = new Map<string, PagoVencidoRow[]>()
    for (const pago of pagosVencidos as unknown as PagoVencidoRow[]) {
      const asesorId = pago.polizas?.asesor_id
      if (!asesorId) continue
      if (!porAsesor.has(asesorId)) porAsesor.set(asesorId, [])
      porAsesor.get(asesorId)!.push(pago)
    }

    const notificaciones = []
    for (const [asesorId, pagos] of porAsesor.entries()) {
      const count = pagos.length
      const primero = pagos[0]
      notificaciones.push({
        usuario_id: asesorId,
        tipo: 'pago_vencido',
        titulo: count === 1 ? '⚠️ Pago Vencido' : `⚠️ ${count} Pagos Vencidos`,
        mensaje:
          count === 1
            ? `El pago de ${primero.polizas?.clientes?.nombre_completo} (Póliza ${primero.polizas?.numero_poliza}) ha vencido.`
            : `Tienes ${count} pagos vencidos hoy. Revisa el dashboard de pagos.`,
        leida: false,
        metadata: {
          pago_ids: pagos.map((p) => p.id),
          poliza_numeros: pagos.map((p) => p.polizas?.numero_poliza),
          monto_total: pagos.reduce((sum, p) => sum + (p.monto_programado ?? 0), 0),
          fecha_limite: primero.fecha_limite,
        },
      })
    }

    const { error: insertError } = await supabase.from('notificaciones').insert(notificaciones)
    if (insertError) {
      console.error('[cron/actualizar-pagos] Error insertando notificaciones:', insertError)
      return 0
    }

    console.log(`[cron/actualizar-pagos] ✅ ${notificaciones.length} notificación(es) creada(s)`)
    return notificaciones.length
  } catch (err) {
    console.error('[cron/actualizar-pagos] Error generando notificaciones:', err)
    return 0
  }
}
