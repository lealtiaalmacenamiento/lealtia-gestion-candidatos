// GET /api/comisiones/sin-conexion - Dashboard de comisiones de agentes SIN mes de conexión
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

type ComisionSinConexionRow = {
  periodo?: string | null
  agente_nombre?: string | null
  total_polizas?: number | null
  prima_total?: number | null
  comision_vigente?: number | null
}

export async function GET(request: Request) {
  try {
    const supabase = getServiceClient()
    const { searchParams } = new URL(request.url)
    
    const periodo = searchParams.get('periodo') // YYYY-MM
    const agente = searchParams.get('agente')

    let query = supabase
      .from('vw_dashboard_comisiones_sin_conexion')
      .select('*')

    // Aplicar filtros
    if (periodo) query = query.eq('periodo', periodo)
    if (agente) query = query.ilike('agente_nombre', `%${agente}%`)

    // Ordenar
    query = query.order('periodo', { ascending: false })
    query = query.order('agente_nombre', { ascending: true })

    const { data, error } = await query

    if (error) {
      console.error('Error obteniendo comisiones sin conexión:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calcular resumen
    const resumen = {
      total_registros: data?.length || 0,
      total_polizas: (data || []).reduce((sum, r: ComisionSinConexionRow) => sum + Number(r.total_polizas ?? 0), 0),
      total_prima: (data || []).reduce((sum, r: ComisionSinConexionRow) => sum + Number(r.prima_total ?? 0), 0),
      total_comision: (data || []).reduce((sum, r: ComisionSinConexionRow) => sum + Number(r.comision_vigente ?? 0), 0),
      periodos: [...new Set((data || []).map((r: ComisionSinConexionRow) => r.periodo).filter(Boolean))]
    }

    return NextResponse.json({
      data: data || [],
      resumen
    })
  } catch (error: unknown) {
    console.error('Error en GET /api/comisiones/sin-conexion:', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Route uses request.url search params; force dynamic rendering
