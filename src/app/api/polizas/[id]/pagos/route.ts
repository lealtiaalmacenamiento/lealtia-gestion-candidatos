// GET /api/polizas/[id]/pagos - Listar pagos programados de una póliza
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

type PagoRow = {
  id: number
  poliza_id: string
  periodo_mes: string
  fecha_limite: string
  estado: 'pendiente' | 'pagado' | 'vencido' | 'omitido'
  fecha_pago_real?: string | null
  monto_pagado?: number | null
  monto_programado?: number | null
  polizas?: {
    numero_poliza?: string | null
    prima_mxn?: number | null
    periodicidad_pago?: string | null
    clientes?: {
      asesor_id?: string | null
      primer_nombre?: string | null
      primer_apellido?: string | null
    } | null
  } | null
}

export async function GET(
  request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
  const polizaId = id
  
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

    const pagosConAlertas = (pagos || []).map((pago: PagoRow) => {
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
        pendientes: pagosConAlertas.filter((p) => p.estado === 'pendiente').length,
        pagados: pagosConAlertas.filter((p) => p.estado === 'pagado').length,
        vencidos: pagosConAlertas.filter((p) => p.estado === 'vencido').length,
        proximos: pagosConAlertas.filter((p) => p.isDueSoon).length
      }
    })
  } catch (error: unknown) {
    console.error('Error en GET /api/polizas/[id]/pagos:', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
