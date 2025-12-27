// GET /api/pagos/alertas - Listar pagos vencidos o próximos a vencer
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export async function GET(request: Request) {
  try {
    const supabase = getServiceClient()
    const { searchParams } = new URL(request.url)
    const scope = searchParams.get('scope') || 'asesor' // asesor | supervisor
    const usuario_id = searchParams.get('usuario_id') // Requerido

    if (!usuario_id) {
      return NextResponse.json({ error: 'Falta usuario_id' }, { status: 400 })
    }

    // Obtener rol del usuario
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol, id_auth')
      .eq('id_auth', usuario_id)
      .single()

    const isSuper = usuario?.rol === 'admin' || usuario?.rol === 'supervisor'

    // Calcular fecha límite para "próximos" (7 días)
    const hoy = new Date()
    const en7Dias = new Date()
    en7Dias.setDate(en7Dias.getDate() + 7)

    let query = supabase
      .from('poliza_pagos_mensuales')
      .select(`
        *,
        polizas!inner(
          numero_poliza,
          prima_mxn,
          periodicidad_pago,
          clientes!inner(
            id,
            asesor_id,
            primer_nombre,
            primer_apellido
          )
        )
      `)
      .eq('estado', 'pendiente')
      .lte('fecha_limite', en7Dias.toISOString().split('T')[0])
      .order('fecha_limite', { ascending: true })

    // Si es asesor, filtrar solo sus pólizas
    if (!isSuper || scope === 'asesor') {
      query = query.eq('polizas.clientes.asesor_id', usuario_id)
    }

    const { data: pagos, error } = await query

    if (error) {
      console.error('Error obteniendo alertas:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Categorizar alertas
    const vencidos = (pagos || []).filter((p: any) => 
      new Date(p.fecha_limite) < hoy
    )
    const proximos = (pagos || []).filter((p: any) => 
      new Date(p.fecha_limite) >= hoy && new Date(p.fecha_limite) <= en7Dias
    )

    return NextResponse.json({
      vencidos: vencidos.map((p: any) => ({
        ...p,
        diasVencidos: Math.floor((hoy.getTime() - new Date(p.fecha_limite).getTime()) / (1000 * 60 * 60 * 24))
      })),
      proximos: proximos.map((p: any) => ({
        ...p,
        diasRestantes: Math.ceil((new Date(p.fecha_limite).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
      })),
      resumen: {
        total_vencidos: vencidos.length,
        total_proximos: proximos.length,
        monto_vencido: vencidos.reduce((sum: number, p: any) => sum + Number(p.monto_programado || 0), 0),
        monto_proximo: proximos.reduce((sum: number, p: any) => sum + Number(p.monto_programado || 0), 0)
      }
    })
  } catch (error: any) {
    console.error('Error en GET /api/pagos/alertas:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Configurar revalidación ISR (cada hora)
export const revalidate = 3600
