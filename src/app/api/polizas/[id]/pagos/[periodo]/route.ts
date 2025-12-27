// POST /api/polizas/[id]/pagos/[periodo] - Marcar un pago como realizado
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; periodo: string }> }
) {
  const resolvedParams = await params
  const polizaId = resolvedParams.id
  const periodoMes = resolvedParams.periodo // Formato: YYYY-MM-DD (primer día del mes)
  
  try {
    const supabase = getServiceClient()

    // Parsear body
    const body = await request.json()
    const { monto_pagado, fecha_pago, notas } = body

    // Obtener el pago
    const { data: pago, error: fetchError } = await supabase
      .from('poliza_pagos_mensuales')
      .select('*, polizas!inner(clientes!inner(asesor_id))')
      .eq('poliza_id', polizaId)
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
    const montoFinal = monto_pagado ?? pago.monto_programado
    const fechaFinal = fecha_pago ?? new Date().toISOString()

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
  } catch (error: any) {
    console.error('Error en POST /api/polizas/[id]/pagos/[periodo]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
