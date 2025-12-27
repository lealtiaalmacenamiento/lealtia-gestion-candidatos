import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: polizaIdStr } = await params
  const polizaId = parseInt(polizaIdStr)
  if (isNaN(polizaId)) {
    return NextResponse.json({ error: 'ID de póliza inválido' }, { status: 400 })
  }

  try {
    const supabase = getServiceClient()
    
    // Verificar que la póliza existe y tiene periodicidad configurada
    const { data: poliza, error: polizaError } = await supabase
      .from('polizas')
      .select('id, numero, periodicidad_pago, fecha_emision, vigencia_anos, prima_anual, estado')
      .eq('id', polizaId)
      .single()

    if (polizaError || !poliza) {
      return NextResponse.json({ error: 'Póliza no encontrada' }, { status: 404 })
    }

    if (poliza.estado === 'cancelada') {
      return NextResponse.json({ 
        error: 'No se pueden generar pagos para pólizas canceladas' 
      }, { status: 400 })
    }

    if (!poliza.periodicidad_pago) {
      return NextResponse.json({ 
        error: 'La póliza no tiene periodicidad de pago configurada' 
      }, { status: 400 })
    }

    // Eliminar pagos existentes que estén pendientes
    const { error: deleteError } = await supabase
      .from('poliza_pagos_mensuales')
      .delete()
      .eq('poliza_id', polizaId)
      .eq('estado', 'pendiente')

    if (deleteError) {
      console.error('Error eliminando pagos pendientes:', deleteError)
      return NextResponse.json({ 
        error: 'Error al limpiar pagos pendientes' 
      }, { status: 500 })
    }

    // Llamar a la función que genera los pagos programados
    // Nota: Esta función debería ser disparada automáticamente por trigger,
    // pero la llamamos manualmente aquí para regenerar
    const { data: result, error: genError } = await supabase
      .rpc('fn_generar_pagos_programados', {
        p_poliza_id: polizaId
      })

    if (genError) {
      console.error('Error generando pagos:', genError)
      return NextResponse.json({ 
        error: 'Error al generar calendario de pagos',
        details: genError.message 
      }, { status: 500 })
    }

    // Consultar los pagos generados
    const { data: pagos, error: pagosError } = await supabase
      .from('poliza_pagos_mensuales')
      .select('*')
      .eq('poliza_id', polizaId)
      .order('periodo_mes')

    if (pagosError) {
      console.error('Error consultando pagos generados:', pagosError)
    }

    return NextResponse.json({
      success: true,
      message: 'Calendario de pagos regenerado exitosamente',
      pagos_generados: pagos?.length || 0,
      pagos: pagos || []
    })

  } catch (error) {
    console.error('Error en POST /api/polizas/[id]/pagos/generar:', error)
    return NextResponse.json({ 
      error: 'Error interno del servidor' 
    }, { status: 500 })
  }
}
