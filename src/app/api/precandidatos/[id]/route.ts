import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const supabase = ensureAdminClient()

const VALID_ESTADOS = ['en_secuencia', 'respondio', 'link_enviado', 'cita_agendada', 'promovido', 'descartado'] as const

export async function GET(_req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await context.params

  const [precandidatoRes, actividadesRes, citasRes] = await Promise.all([
    supabase
      .from('sp_precandidatos')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('sp_actividades')
      .select('id,tipo,descripcion,metadata,created_at')
      .eq('precandidato_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('sp_citas')
      .select('id,inicio,fin,meeting_url,estado,calcom_booking_uid,reclutador_id,created_at')
      .eq('precandidato_id', id)
      .order('inicio', { ascending: false })
  ])

  if (precandidatoRes.error) {
    return NextResponse.json({ error: precandidatoRes.error.message }, { status: 500 })
  }
  if (!precandidatoRes.data) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  return NextResponse.json({
    ...precandidatoRes.data,
    actividades: actividadesRes.data ?? [],
    citas: citasRes.data ?? []
  })
}

export async function PATCH(req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await context.params

  let body: {
    estado?: string
    notas?: string | null
    reclutador_id?: string | null
    email?: string | null
    empresa?: string | null
    cargo?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.estado !== undefined) {
    if (!(VALID_ESTADOS as readonly string[]).includes(body.estado)) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    }
    // Prevent regressing from promovido
    const { data: current } = await supabase
      .from('sp_precandidatos')
      .select('estado')
      .eq('id', id)
      .maybeSingle()
    if (current?.estado === 'promovido' && body.estado !== 'promovido') {
      return NextResponse.json({ error: 'No se puede revertir un precandidato promovido' }, { status: 409 })
    }
    update.estado = body.estado
  }
  if (body.notas !== undefined) update.notas = body.notas
  if (body.reclutador_id !== undefined) update.reclutador_id = body.reclutador_id
  if (body.email !== undefined) update.email = body.email?.trim() ?? null
  if (body.empresa !== undefined) update.empresa = body.empresa?.trim() ?? null
  if (body.cargo !== undefined) update.cargo = body.cargo?.trim() ?? null

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('sp_precandidatos')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('sp_precandidato_updated', { snapshot: { id, update } })
  return NextResponse.json(data)
}
