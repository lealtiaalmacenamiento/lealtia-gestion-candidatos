import { NextRequest, NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { resolveLandingAgent } from '@/lib/landingAgent'
import {
  createLandingQuestionnaireLink,
  getLandingPprQuestionnaire
} from '@/lib/questionnaireLanding'
import { logAccion } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { agent_code?: string | null } | null
  const rawCode = body?.agent_code?.trim() || null
  const supabase = ensureAdminClient()

  const [agent, questionnaireResult] = await Promise.all([
    resolveLandingAgent(supabase, rawCode),
    getLandingPprQuestionnaire(supabase)
  ])

  if (!agent) return NextResponse.json({ error: 'No se encontró agente disponible' }, { status: 404 })
  if (questionnaireResult.error) {
    return NextResponse.json({ error: questionnaireResult.error }, { status: 500 })
  }
  if (!questionnaireResult.questionnaire) {
    return NextResponse.json({ error: 'No hay cuestionario PPR activo configurado' }, { status: 404 })
  }

  let created
  try {
    created = await createLandingQuestionnaireLink(supabase, {
      questionnaire: questionnaireResult.questionnaire,
      agent,
      preferredCode: agent.code
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'No se pudo generar el enlace'
    }, { status: 409 })
  }

  const origin = req.nextUrl.origin
  const publicUrl = `${origin.replace(/\/$/, '')}/ppr/${created.token}`
  void logAccion('generar_enlace_landing_ppr', {
    tabla_afectada: 'questionnaire_links',
    snapshot: {
      questionnaire_id: questionnaireResult.questionnaire.id,
      agente_id: agent.agente_id,
      agent_code: agent.code ?? null,
      used_default_agent: agent.is_default,
      code_error: agent.code_error ?? null
    }
  })

  return NextResponse.json({
    public_url: publicUrl,
    token: created.token,
    agent: {
      id: agent.agente_id,
      nombre: agent.nombre,
      is_default: agent.is_default,
      code_error: agent.code_error ?? null
    },
    questionnaire: {
      id: questionnaireResult.questionnaire.id,
      titulo: questionnaireResult.questionnaire.titulo
    },
    event_title: created.eventTitle
  }, { status: 201 })
}
