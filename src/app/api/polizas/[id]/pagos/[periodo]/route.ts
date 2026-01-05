// POST /api/polizas/[id]/pagos/[periodo] - Marcar un pago como realizado
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; periodo: string }> }
) {
  const resolvedParams = await params
  const polizaIdNum = Number(resolvedParams.id)
  const periodoMes = resolvedParams.periodo // Formato esperado: YYYY-MM-DD (primer día del mes)

  if (!Number.isFinite(polizaIdNum)) {
    return NextResponse.json({ error: 'ID de póliza inválido' }, { status: 400 })
  }
  
  try {
    const supabase = getServiceClient()

    // Parsear body
    const body = await request.json()
    const { monto_pagado, fecha_pago, notas } = body

    if (monto_pagado !== undefined && (Number.isNaN(Number(monto_pagado)) || Number(monto_pagado) < 0)) {
      return NextResponse.json({ error: 'Monto pagado inválido' }, { status: 400 })
    }

    // Obtener el pago
    const { data: pago, error: fetchError } = await supabase
      .from('poliza_pagos_mensuales')
      .select('*, polizas!inner(clientes!inner(asesor_id))')
      .eq('poliza_id', polizaIdNum)
      .eq('periodo_mes', periodoMes)
      .single()

    if (fetchError || !pago) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
    }

    // Validar que no esté ya pagado
    if (pago.estado === 'pagado') {
      return NextResponse.json({ error: 'Este pago ya fue registrado como pagado' }, { status: 400 })
    }

    // Usar monto programado si no se especifica otro
    const montoFinal = monto_pagado !== undefined ? Number(monto_pagado) : pago.monto_programado
    const fechaPagoDate = fecha_pago ? new Date(fecha_pago) : new Date()

    if (Number.isNaN(fechaPagoDate.getTime())) {
      return NextResponse.json({ error: 'Fecha de pago inválida' }, { status: 400 })
    }

    const fechaFinal = fechaPagoDate.toISOString()

    // Actualizar pago
    const { data: updated, error: updateError } = await supabase
      .from('poliza_pagos_mensuales')
      .update({
        estado: 'pagado',
        monto_pagado: montoFinal,
        fecha_pago_real: fechaFinal,
        notas: notas || pago.notas,
        updated_at: new Date().toISOString()
      })
      .eq('id', pago.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error actualizando pago:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // TODO: Crear notificación in-app de confirmación
    // await crearNotificacion(supabase, {
    //   usuario_id: pago.polizas.clientes.asesor_id,
    //   tipo: 'pago_registrado',
    //   titulo: 'Pago registrado',
    //   mensaje: `Pago de ${montoFinal} MXN registrado para póliza`,
    //   metadata: { poliza_id: polizaId, pago_id: pago.id }
    // })

    return NextResponse.json({
      success: true,
      pago: updated,
      message: 'Pago registrado exitosamente'
    })
  } catch (error: unknown) {
    console.error('Error en POST /api/polizas/[id]/pagos/[periodo]:', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
