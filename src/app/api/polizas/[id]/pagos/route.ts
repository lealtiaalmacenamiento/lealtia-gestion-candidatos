// GET /api/polizas/[id]/pagos - Listar pagos programados de una póliza
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params
  const polizaId = resolvedParams.id
  
  try {
    const supabase = getServiceClient()

    // Obtener pagos programados con información de la póliza
    const { data: pagos, error } = await supabase
      .from('poliza_pagos_mensuales')
      .select(`
        *,
        polizas!inner(
          numero_poliza,
          prima_mxn,
          periodicidad_pago,
          clientes!inner(
            asesor_id,
            primer_nombre,
            primer_apellido
          )
        )
      `)
      .eq('poliza_id', polizaId)
      .order('periodo_mes', { ascending: true })

    if (error) {
      console.error('Error obteniendo pagos:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calcular flags de alerta
    const hoy = new Date()
    const en7Dias = new Date()
    en7Dias.setDate(en7Dias.getDate() + 7)

    const pagosConAlertas = (pagos || []).map((pago: any) => {
      const fechaLimite = new Date(pago.fecha_limite)
      const isOverdue = pago.estado === 'vencido' || (pago.estado === 'pendiente' && fechaLimite < hoy)
      const isDueSoon = pago.estado === 'pendiente' && fechaLimite >= hoy && fechaLimite <= en7Dias

      return {
        ...pago,
        isOverdue,
        isDueSoon,
        diasRestantes: pago.estado === 'pendiente' 
          ? Math.ceil((fechaLimite.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
          : null
      }
    })

    return NextResponse.json({
      poliza_id: polizaId,
      pagos: pagosConAlertas,
      resumen: {
        total: pagosConAlertas.length,
        pendientes: pagosConAlertas.filter((p: any) => p.estado === 'pendiente').length,
        pagados: pagosConAlertas.filter((p: any) => p.estado === 'pagado').length,
        vencidos: pagosConAlertas.filter((p: any) => p.estado === 'vencido').length,
        proximos: pagosConAlertas.filter((p: any) => p.isDueSoon).length
      }
    })
  } catch (error: any) {
    console.error('Error en GET /api/polizas/[id]/pagos:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
