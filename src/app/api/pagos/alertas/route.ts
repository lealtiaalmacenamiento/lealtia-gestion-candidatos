// GET /api/pagos/alertas - Listar pagos vencidos o próximos a vencer
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

type PolizaCliente = {
  asesor_id?: string | null
  primer_nombre?: string | null
  primer_apellido?: string | null
}

type PolizaInfo = {
  numero_poliza?: string | null
  prima_mxn?: number | null
  periodicidad_pago?: string | null
  clientes?: PolizaCliente | null
}

type PagoRow = {
  id?: number
  poliza_id?: string | null
  estado?: string | null
  fecha_limite?: string | null
  fecha_programada?: string | null
  monto_programado?: number | null
  polizas?: PolizaInfo | null
}

type UsuarioResumen = {
  id_auth: string
  nombre?: string | null
  email?: string | null
}

function parseYmdToUtc(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  const [y, m, d] = parts
  return new Date(Date.UTC(y, m - 1, d))
}

export const dynamic = 'force-dynamic'

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

    // Calcular fecha límite para "próximos" (7 días) en UTC para evitar desfaces de huso horario
    const hoyUtc = new Date()
    hoyUtc.setUTCHours(0, 0, 0, 0)
    const en7DiasUtc = new Date(hoyUtc)
    en7DiasUtc.setUTCDate(en7DiasUtc.getUTCDate() + 7)

    // Si es asesor, obtener sus pólizas primero
    let polizaIds: string[] = []
    if (!isSuper || scope === 'asesor') {
      const { data: polizas } = await supabase
        .from('polizas')
        .select('id, clientes!inner(asesor_id)')
        .eq('clientes.asesor_id', usuario_id)
      
      polizaIds = polizas?.map((p) => p.id).filter(Boolean) || []
      
      if (polizaIds.length === 0) {
        // No tiene pólizas, devolver vacío
        return NextResponse.json({
          vencidos: [],
          proximos: [],
          resumen: {
            total_vencidos: 0,
            total_proximos: 0,
            monto_vencido: 0,
            monto_proximo: 0
          }
        })
      }
    }

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
      .in('estado', ['pendiente', 'vencido'])
      .lte('fecha_limite', en7DiasUtc.toISOString().split('T')[0])
      .order('fecha_limite', { ascending: true })

    // Filtrar por pólizas del asesor
    if (polizaIds.length > 0) {
      query = query.in('poliza_id', polizaIds)
    }

    const { data: pagos, error } = await query

    if (error) {
      console.error('Error obteniendo alertas:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Obtener IDs únicos de asesores
    const asesorIds = [...new Set(
      (pagos || [])
        .map((p: PagoRow) => p.polizas?.clientes?.asesor_id)
        .filter((id): id is string => Boolean(id))
    )]

    // Obtener información de usuarios/asesores
    let asesoresMap: Record<string, UsuarioResumen> = {}
    if (asesorIds.length > 0) {
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id_auth, nombre, email')
        .in('id_auth', asesorIds)
      
      if (usuarios) {
        asesoresMap = usuarios.reduce<Record<string, UsuarioResumen>>((acc, u) => {
          acc[u.id_auth] = u
          return acc
        }, {})
      }
    }

    // Enriquecer pagos con información del asesor
    const pagosEnriquecidos = (pagos || []).map((p: PagoRow) => {
      const asesorId = p.polizas?.clientes?.asesor_id
      const polizaInfo = p.polizas ?? {}
      const clienteInfo = p.polizas?.clientes ?? {}
      return {
        ...p,
        polizas: {
          ...polizaInfo,
          clientes: {
            ...clienteInfo,
            usuarios: asesorId ? asesoresMap[asesorId] : null
          }
        }
      }
    })

    // Categorizar alertas
    const vencidos = pagosEnriquecidos.filter((p) => {
      const f = parseYmdToUtc(p.fecha_limite ?? null)
      return f ? f < hoyUtc : false
    })
    const proximos = pagosEnriquecidos.filter((p) => {
      const f = parseYmdToUtc(p.fecha_limite ?? null)
      return f ? f >= hoyUtc && f <= en7DiasUtc : false
    })

    return NextResponse.json({
      vencidos: vencidos.map((p: PagoRow) => {
        const f = parseYmdToUtc(p.fecha_limite ?? null)
        const dias = f ? Math.floor((hoyUtc.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)) : null
        return {
          ...p,
          diasVencidos: dias ?? null
        }
      }),
      proximos: proximos.map((p: PagoRow) => {
        const f = parseYmdToUtc(p.fecha_limite ?? null)
        const dias = f ? Math.ceil((f.getTime() - hoyUtc.getTime()) / (1000 * 60 * 60 * 24)) : null
        return {
          ...p,
          diasRestantes: dias ?? null
        }
      }),
      resumen: {
        total_vencidos: vencidos.length,
        total_proximos: proximos.length,
        monto_vencido: vencidos.reduce((sum, p: PagoRow) => sum + Number(p.monto_programado ?? 0), 0),
        monto_proximo: proximos.reduce((sum, p: PagoRow) => sum + Number(p.monto_programado ?? 0), 0)
      }
    })
  } catch (error: unknown) {
    console.error('Error en GET /api/pagos/alertas:', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Route uses request.url search params; force dynamic rendering
