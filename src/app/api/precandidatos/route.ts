import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const supabase = ensureAdminClient()

const VALID_ESTADOS = ['en_secuencia', 'respondio', 'link_enviado', 'cita_agendada', 'promovido', 'descartado'] as const
type Estado = typeof VALID_ESTADOS[number]

export async function GET(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const url = new URL(req.url)
  const campana_id = url.searchParams.get('campana_id')
  const estado = url.searchParams.get('estado') as Estado | null
  const q = url.searchParams.get('q')?.trim().toLowerCase()
  const reclutadorPropio = url.searchParams.get('propios') === '1'
  const limitParam = url.searchParams.get('limit')
  const offsetParam = url.searchParams.get('offset')

  let query = supabase
    .from('sp_precandidatos')
    .select('id,campana_id,reclutador_id,sp_contact_id,nombre,apellido,linkedin_url,email,empresa,cargo,estado,calcom_booking_uid,candidato_id,notas,created_at,updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (campana_id) query = query.eq('campana_id', campana_id)
  if (estado && (VALID_ESTADOS as readonly string[]).includes(estado)) {
    query = query.eq('estado', estado)
  }
  if (reclutadorPropio && actor.id_auth) {
    query = query.eq('reclutador_id', actor.id_auth)
  }
  if (q) {
    query = query.or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%,empresa.ilike.%${q}%`)
  }

  const limit = limitParam ? Math.min(Number(limitParam), 200) : 50
  const offset = offsetParam ? Number(offsetParam) : 0
  if (Number.isFinite(limit) && limit > 0) query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: data ?? [], total: count ?? 0 })
}

export async function POST(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let body: {
    campana_id?: string
    reclutador_id?: string | null
    nombre?: string
    apellido?: string | null
    linkedin_url?: string | null
    email?: string | null
    empresa?: string | null
    cargo?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.campana_id) return NextResponse.json({ error: 'campana_id es obligatorio' }, { status: 400 })
  if (!body.nombre?.trim()) return NextResponse.json({ error: 'nombre es obligatorio' }, { status: 400 })

  const { data, error } = await supabase
    .from('sp_precandidatos')
    .insert({
      campana_id: body.campana_id,
      reclutador_id: body.reclutador_id ?? null,
      nombre: body.nombre.trim(),
      apellido: body.apellido?.trim() ?? null,
      linkedin_url: body.linkedin_url?.trim() ?? null,
      email: body.email?.trim() ?? null,
      empresa: body.empresa?.trim() ?? null,
      cargo: body.cargo?.trim() ?? null
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAccion('sp_precandidato_created', { snapshot: { id: data.id } })
  return NextResponse.json(data, { status: 201 })
}
