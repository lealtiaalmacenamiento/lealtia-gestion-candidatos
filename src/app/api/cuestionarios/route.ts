import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureSuper } from '@/lib/apiGuards'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { questionnaireInputSchema } from '@/lib/validation/questionnaireSchemas'
import { logAccion } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const actor = await getUsuarioSesion(req.headers)
  if (!actor?.activo) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const onlyActive = req.nextUrl.searchParams.get('active') === '1'
  const supabase = ensureAdminClient()
  let query = supabase
    .from('questionnaires')
    .select('*')
    .order('updated_at', { ascending: false })
  if (onlyActive) query = query.eq('activo', true)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questionnaires: data || [] })
}

export async function POST(req: NextRequest) {
  const guard = await ensureSuper(req)
  if (guard.kind === 'error') return guard.response

  const parsed = questionnaireInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Cuestionario inválido', details: parsed.error.flatten() }, { status: 400 })
  }

  const actor = guard.usuario
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('questionnaires')
    .insert({
      ...parsed.data,
      version: 1,
      created_by: actor.id_auth ?? null,
      updated_at: new Date().toISOString()
    })
    .select('*')
    .single()

  if (error) {
    const status = error.code === '23505' ? 409 : 500
    return NextResponse.json({ error: error.code === '23505' ? 'Ya existe un cuestionario con ese identificador' : error.message }, { status })
  }
  await logAccion('crear_cuestionario', {
    usuario: actor.email,
    tabla_afectada: 'questionnaires',
    snapshot: { id: data.id, slug: data.slug, version: data.version }
  })
  return NextResponse.json({ questionnaire: data }, { status: 201 })
}
