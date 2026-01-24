import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export async function GET(request: Request) {
  try {
    const supabase = getServiceClient()
    const { searchParams } = new URL(request.url)
    const tab = searchParams.get('tab') // 'con' o 'sin'

    let query
    
    if (tab === 'sin') {
      // Solo agentes sin mes de conexión
      query = supabase
        .from('vw_dashboard_comisiones_sin_conexion')
        .select('id_auth, agente_nombre')
        .order('agente_nombre')
    } else {
      // Solo agentes con mes de conexión (default)
      query = supabase
        .from('vw_dashboard_comisiones_con_conexion')
        .select('id_auth, agente_nombre')
        .order('agente_nombre')
    }

    const { data, error } = await query

    if (error) throw error

    // Deduplicar agentes por id_auth
    const agentesMap = new Map<string, string>()
    data?.forEach((a: { id_auth: string; agente_nombre: string }) => 
      agentesMap.set(a.id_auth, a.agente_nombre)
    )

    const agentes = Array.from(agentesMap.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))

    return NextResponse.json({ data: agentes })
  } catch (error) {
    console.error('Error fetching agentes:', error)
    return NextResponse.json(
      { error: 'Error al cargar agentes' },
      { status: 500 }
    )
  }
}
