import { NextRequest, NextResponse } from 'next/server'
import { ensureSuper } from '@/lib/apiGuards'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { getLandingPprQuestionnaire, saveLandingPprQuestionnaire } from '@/lib/questionnaireLanding'
import { logAccion } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = await ensureSuper(req)
  if (guard.kind === 'error') return guard.response
  const supabase = ensureAdminClient()
  const result = await getLandingPprQuestionnaire(supabase)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({
    questionnaire_id: result.questionnaire?.id ?? null,
    configured_id: result.configuredId,
    questionnaire: result.questionnaire
  })
}

export async function PATCH(req: NextRequest) {
  const guard = await ensureSuper(req)
  if (guard.kind === 'error') return guard.response
  const body = await req.json().catch(() => null) as { questionnaire_id?: string } | null
  const questionnaireId = body?.questionnaire_id?.trim()
  if (!questionnaireId) {
    return NextResponse.json({ error: 'Selecciona un cuestionario' }, { status: 400 })
  }

  const supabase = ensureAdminClient()
  const { data: questionnaire, error } = await supabase
    .from('questionnaires')
    .select('id,titulo,activo,requiere_ppr')
    .eq('id', questionnaireId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!questionnaire?.activo) return NextResponse.json({ error: 'El cuestionario no está activo' }, { status: 409 })
  if (!questionnaire.requiere_ppr) {
    return NextResponse.json({ error: 'El cuestionario seleccionado debe incluir simulación PPR' }, { status: 409 })
  }

  try {
    await saveLandingPprQuestionnaire(supabase, questionnaireId, guard.usuario.email)
  } catch (saveError) {
    return NextResponse.json({
      error: saveError instanceof Error ? saveError.message : 'No se pudo guardar la configuración'
    }, { status: 500 })
  }

  await logAccion('configurar_cuestionario_landing_ppr', {
    usuario: guard.usuario.email,
    tabla_afectada: 'Parametros',
    snapshot: { questionnaire_id: questionnaireId, titulo: questionnaire.titulo }
  })

  return NextResponse.json({ success: true, questionnaire_id: questionnaireId })
}

