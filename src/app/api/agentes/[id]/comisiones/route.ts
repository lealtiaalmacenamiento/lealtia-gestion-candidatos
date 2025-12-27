// GET /api/agentes/[id]/comisiones
// Resumen de comisiones para un agente específico

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 3600 // 1 hora

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agenteId } = await params
  try {
    const supabase = getServiceClient()
    const { searchParams } = new URL(req.url)
    const periodo = searchParams.get('periodo') // Opcional: formato YYYY-MM

    // Obtener datos del agente
    const { data: agente, error: agenteError } = await supabase
      .from('usuarios')
      .select('id, nombre_completo, rol, mes_conexion')
      .eq('id', agenteId)
      .single()

    if (agenteError || !agente) {
      return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })
    }

    // Determinar vista a consultar según mes_conexion
    const viewName = agente.mes_conexion 
      ? 'vw_dashboard_comisiones_con_conexion'
      : 'vw_dashboard_comisiones_sin_conexion'

    // Query base
    let query = supabase
      .from(viewName)
      .select('*')
      .eq('agente_id', agenteId)
      .order('periodo', { ascending: false })

    // Filtrar por periodo si se especifica
    if (periodo) {
      query = query.eq('periodo', periodo)
    }

    const { data: comisiones, error: comisionesError } = await query

    if (comisionesError) {
      console.error('Error consultando comisiones:', comisionesError)
      return NextResponse.json({ 
        error: 'Error al consultar comisiones' 
      }, { status: 500 })
    }

    // Calcular resumen
    const resumen = {
      agente: {
        id: agente.id,
        nombre: agente.nombre_completo,
        rol: agente.rol,
        mes_conexion: agente.mes_conexion
      },
      total_polizas: comisiones?.reduce((sum: number, c: any) => sum + (c.total_polizas || 0), 0) || 0,
      total_prima: comisiones?.reduce((sum: number, c: any) => sum + (c.total_prima || c.prima_mes_1 + c.prima_mes_2 + c.prima_mes_3 + c.prima_mes_4_plus || 0), 0) || 0,
      total_comision: comisiones?.reduce((sum: number, c: any) => sum + (c.comision_vigente || 0), 0) || 0,
      periodos_activos: [...new Set(comisiones?.map((c: any) => c.periodo) || [])].length
    }

    // Si tiene mes_conexion, agregar desglose por mes
    if (agente.mes_conexion) {
      Object.assign(resumen, {
        desglose_meses: {
          mes_1: {
            polizas: comisiones?.reduce((sum: number, c: any) => sum + (c.polizas_mes_1 || 0), 0) || 0,
            prima: comisiones?.reduce((sum: number, c: any) => sum + (c.prima_mes_1 || 0), 0) || 0
          },
          mes_2: {
            polizas: comisiones?.reduce((sum: number, c: any) => sum + (c.polizas_mes_2 || 0), 0) || 0,
            prima: comisiones?.reduce((sum: number, c: any) => sum + (c.prima_mes_2 || 0), 0) || 0
          },
          mes_3: {
            polizas: comisiones?.reduce((sum: number, c: any) => sum + (c.polizas_mes_3 || 0), 0) || 0,
            prima: comisiones?.reduce((sum: number, c: any) => sum + (c.prima_mes_3 || 0), 0) || 0
          },
          mes_4_plus: {
            polizas: comisiones?.reduce((sum: number, c: any) => sum + (c.polizas_mes_4_plus || 0), 0) || 0,
            prima: comisiones?.reduce((sum: number, c: any) => sum + (c.prima_mes_4_plus || 0), 0) || 0
          }
        }
      })
    }

    return NextResponse.json({
      resumen,
      comisiones: comisiones || [],
      periodo_filtrado: periodo || null
    })

  } catch (error) {
    console.error('Error en GET /api/agentes/[id]/comisiones:', error)
    return NextResponse.json({ 
      error: 'Error interno del servidor' 
    }, { status: 500 })
  }
}
