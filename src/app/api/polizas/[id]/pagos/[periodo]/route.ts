// POST /api/polizas/[id]/pagos/[periodo] - Marcar un pago como realizado
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; periodo: string }> }
) {
  const resolvedParams = await params
  const polizaId = resolvedParams.id
  const periodoMes = resolvedParams.periodo // Formato esperado: YYYY-MM-DD (primer día del mes)

  if (!polizaId) {
    return NextResponse.json({ error: 'ID de póliza inválido' }, { status: 400 })
  }
  
  try {
    const supabase = getServiceClient()

    // Parsear body
    const body = await request.json()
    const { monto_pagado, fecha_pago, notas, accion } = body

    // accion: 'pagado' (default) | 'omitido'
    const esOmitido = accion === 'omitido'

    if (!esOmitido && monto_pagado !== undefined && (Number.isNaN(Number(monto_pagado)) || Number(monto_pagado) < 0)) {
      return NextResponse.json({ error: 'Monto pagado inválido' }, { status: 400 })
    }

    // Obtener el pago (solo columnas propias, sin joins que puedan fallar por FK faltante)
    const { data: pago, error: fetchError } = await supabase
      .from('poliza_pagos_mensuales')
      .select('*')
      .eq('poliza_id', polizaId)
      .eq('periodo_mes', periodoMes)
      .single()

    if (fetchError || !pago) {
      console.error('[pagos-periodo] pago no encontrado polizaId:', polizaId, 'periodo:', periodoMes, 'err:', fetchError)
      return NextResponse.json({ error: `Pago no encontrado (poliza=${polizaId} periodo=${periodoMes})`, detail: fetchError?.message }, { status: 404 })
    }

    // Validar que no esté ya en estado final
    if (pago.estado === 'pagado') {
      return NextResponse.json({ error: 'Este pago ya fue registrado como pagado' }, { status: 400 })
    }
    if (pago.estado === 'omitido' && esOmitido) {
      return NextResponse.json({ error: 'Este pago ya está marcado como omitido' }, { status: 400 })
    }

    let updateData: Record<string, unknown>

    if (esOmitido) {
      updateData = {
        estado: 'omitido',
        notas: notas || pago.notas,
        updated_at: new Date().toISOString()
      }
    } else {
      // Usar monto programado si no se especifica otro
      const montoFinal = monto_pagado !== undefined ? Number(monto_pagado) : pago.monto_programado
      const fechaPagoDate = fecha_pago ? new Date(fecha_pago) : new Date()

      if (Number.isNaN(fechaPagoDate.getTime())) {
        return NextResponse.json({ error: 'Fecha de pago inválida' }, { status: 400 })
      }

      updateData = {
        estado: 'pagado',
        monto_pagado: montoFinal,
        fecha_pago_real: fechaPagoDate.toISOString(),
        notas: notas || pago.notas,
        updated_at: new Date().toISOString()
      }
    }

    // Actualizar pago
    const { data: updated, error: updateError } = await supabase
      .from('poliza_pagos_mensuales')
      .update(updateData)
      .eq('id', pago.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error actualizando pago:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      pago: updated,
      message: esOmitido ? 'Pago marcado como omitido' : 'Pago registrado exitosamente'
    })
  } catch (error: unknown) {
    console.error('Error en POST /api/polizas/[id]/pagos/[periodo]:', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
