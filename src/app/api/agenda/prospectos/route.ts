import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import type { ProspectoEstado } from '@/types'

type ProspectoListRow = {
  id: number
  nombre: string
  email: string | null
  telefono: string | null
  estado: ProspectoEstado
  agente_id: number
  semana_iso: number | null
  anio: number | null
  fecha_cita: string | null
  updated_at: string
}

function canReadAgenda(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (!usuario) return false
  if (usuario.rol === 'admin' || usuario.rol === 'superusuario') return true
  if (usuario.rol === 'agente') return true
  return Boolean(usuario.is_desarrollador)
}

function isAgendaManager(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (!usuario) return false
  if (usuario.rol === 'admin' || usuario.rol === 'superusuario') return true
  return Boolean(usuario.is_desarrollador)
}

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!canReadAgenda(usuario)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const url = new URL(req.url)
  let agenteId = url.searchParams.get('agente_id')
  const query = (url.searchParams.get('q') || '').trim()
  const limitParam = url.searchParams.get('limit')
  const includeConCita = url.searchParams.get('include_con_cita') === '1'
  // By default include prospectos even if they don't have an email address.
  // The caller can opt-out by passing include_sin_correo=0 to exclude rows
  // with null email (legacy behavior).
  const includeSinCorreo = url.searchParams.get('include_sin_correo') !== '0'
  const debug = url.searchParams.get('debug') === '1'

  if (usuario.rol === 'agente') {
    agenteId = String(usuario.id)
  } else if (!agenteId && !isAgendaManager(usuario)) {
    agenteId = String(usuario.id)
  }

  const supabase = ensureAdminClient()
  const limit = Math.max(Number(limitParam) || 100, 1)

  let builder = supabase
    .from('prospectos')
    .select('id,nombre,email,telefono,estado,agente_id,semana_iso,anio,fecha_cita,updated_at')
    .order('anio', { ascending: false })
    .order('semana_iso', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (agenteId) {
    builder = builder.eq('agente_id', Number(agenteId))
  }

  if (!includeConCita) {
    // Mostrar por defecto los prospectos que NO tienen cita creada
    // y que estén en estados relevantes para agendar (pendiente y seguimiento).
    // Esto evita incluir prospectos ya convertidos o descartados.
    // Para incluir prospectos con cita, pasar include_con_cita=1 en la querystring.
    builder = builder.eq('cita_creada', false).in('estado', ['pendiente', 'seguimiento'])
  }

  if (!includeSinCorreo) {
    builder = builder.not('email', 'is', null)
  }

  if (query) {
    const sanitized = query.replace(/%/g, '').replace(/_/g, '')
    builder = builder.or(
      [
        `nombre.ilike.%${sanitized}%`,
        `email.ilike.%${sanitized}%`,
        `telefono.ilike.%${sanitized}%`
      ].join(',')
    )
  }

  const { data, error } = await builder
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows: ProspectoListRow[] = (data || []).filter((row): row is ProspectoListRow => Boolean(row))

  const formatted = rows.map((row) => ({
    id: row.id,
    nombre: row.nombre,
    email: row.email ?? null,
    telefono: row.telefono ?? null,
    estado: row.estado,
    semana_iso: row.semana_iso ?? null,
    anio: row.anio ?? null,
    fecha_cita: row.fecha_cita ?? null
  }))

  if (debug) {
    return NextResponse.json({
      prospectos: formatted,
      meta: {
        agenteId: agenteId ?? null,
        limit,
        includeConCita: includeConCita ? true : false,
        includeSinCorreo: includeSinCorreo ? true : false,
        query: query || null
      }
    })
  }

  return NextResponse.json({ prospectos: formatted })
}
