import { NextRequest, NextResponse } from 'next/server'
import { ensureSuper } from '@/lib/apiGuards'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { questionnaireInputSchema } from '@/lib/validation/questionnaireSchemas'
import { logAccion } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await ensureSuper(req)
  if (guard.kind === 'error') return guard.response
  const { id } = await context.params
  const parsed = questionnaireInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Cuestionario inválido', details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = ensureAdminClient()
  const { data: current, error: currentError } = await supabase
    .from('questionnaires')
    .select('version')
    .eq('id', id)
    .maybeSingle()
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: 'Cuestionario no encontrado' }, { status: 404 })

  const { data, error } = await supabase
    .from('questionnaires')
    .update({
      ...parsed.data,
      version: Number(current.version || 1) + 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) {
    const status = error.code === '23505' ? 409 : 500
    return NextResponse.json({ error: error.code === '23505' ? 'Ya existe un cuestionario con ese identificador' : error.message }, { status })
  }
  await logAccion('actualizar_cuestionario', {
    usuario: guard.usuario.email,
    tabla_afectada: 'questionnaires',
    snapshot: { id, version: data.version }
  })
  return NextResponse.json({ questionnaire: data })
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await ensureSuper(req)
  if (guard.kind === 'error') return guard.response
  const { id } = await context.params
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('questionnaires')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, activo')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Cuestionario no encontrado' }, { status: 404 })
  await logAccion('desactivar_cuestionario', {
    usuario: guard.usuario.email,
    tabla_afectada: 'questionnaires',
    snapshot: { id }
  })
  return NextResponse.json({ success: true })
}
