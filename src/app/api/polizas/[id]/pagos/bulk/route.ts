/**
 * POST /api/polizas/[id]/pagos/bulk
 * Marca múltiples períodos de pago como pagados en una sola llamada.
 * Solo accesible para supervisores y desarrolladores comerciales.
 *
 * Body: { periodos: string[]; fecha_pago: string; notas?: string }
 * Response: { success: true; marcados: number; errores: { periodo: string; error: string }[] }
 */
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { isSuperRole } from '@/lib/roles'
import { logAccion } from '@/lib/logger'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await getUsuarioSesion(request.headers)
  if (!usuario) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const canActDirect = isSuperRole(usuario.rol) || Boolean(usuario.is_desarrollador)
  if (!canActDirect) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id: polizaId } = await params
  if (!polizaId) {
    return NextResponse.json({ error: 'ID de póliza inválido' }, { status: 400 })
  }

  let body: { periodos?: unknown; fecha_pago?: unknown; notas?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const periodos = Array.isArray(body.periodos) ? (body.periodos as unknown[]).filter((p): p is string => typeof p === 'string' && p.length > 0) : []
  if (periodos.length === 0) {
    return NextResponse.json({ error: 'Se requiere al menos un periodo' }, { status: 400 })
  }

  const fechaPagoRaw = typeof body.fecha_pago === 'string' ? body.fecha_pago.trim() : ''
  const fechaPagoDate = fechaPagoRaw ? new Date(fechaPagoRaw) : new Date()
  if (Number.isNaN(fechaPagoDate.getTime())) {
    return NextResponse.json({ error: 'fecha_pago inválida' }, { status: 400 })
  }
  const fechaPagoIso = fechaPagoDate.toISOString()
  const notas = typeof body.notas === 'string' ? body.notas.trim() : null

  const supabase = getServiceClient()
  const errores: { periodo: string; error: string }[] = []
  let marcados = 0

  for (const periodo of periodos) {
    try {
      // Obtener el pago para conocer su monto_programado y estado
      const { data: pago, error: fetchErr } = await supabase
        .from('poliza_pagos_mensuales')
        .select('id, estado, monto_programado')
        .eq('poliza_id', polizaId)
        .eq('periodo_mes', periodo)
        .single()

      if (fetchErr || !pago) {
        errores.push({ periodo, error: fetchErr?.message ?? 'Pago no encontrado' })
        continue
      }

      if (pago.estado === 'pagado') {
        // Ya estaba pagado — no es error, simplemente lo ignoramos
        continue
      }

      const { error: updateErr } = await supabase
        .from('poliza_pagos_mensuales')
        .update({
          estado: 'pagado',
          monto_pagado: pago.monto_programado,
          fecha_pago_real: fechaPagoIso,
          notas: notas || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pago.id)

      if (updateErr) {
        errores.push({ periodo, error: updateErr.message })
        continue
      }

      marcados++
    } catch (e) {
      errores.push({ periodo, error: e instanceof Error ? e.message : 'Error desconocido' })
    }
  }

  void logAccion('bulk_marcar_pagos_poliza', {
    tabla_afectada: 'poliza_pagos_mensuales',
    snapshot: { poliza_id: polizaId, marcados, errores_count: errores.length, periodos }
  })

  return NextResponse.json({ success: true, marcados, errores })
}
