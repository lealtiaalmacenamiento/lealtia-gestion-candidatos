import { NextRequest, NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { resolvePublicQuestionnaireLink } from '@/lib/questionnairePublic'
import {
  extractSemanticAnswers,
  validateQuestionnaireAnswers,
  type QuestionnaireSection
} from '@/lib/validation/questionnaireSchemas'
import { logAccion } from '@/lib/logger'
import { calculatePpr, type PprPlanKey, type PprResult } from '@/lib/pprCalculator'
import { notifyQuestionnaireAgent } from '@/lib/questionnaireNotifications'
import { ensureQuestionnaireProspect, upsertPprNote } from '@/lib/questionnaireProspect'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params
  const { link, error } = await resolvePublicQuestionnaireLink(token)
  if (error) return NextResponse.json({ error }, { status: 500 })
  if (!link || !link.questionnaire.activo) {
    return NextResponse.json({ error: 'Este enlace no está disponible' }, { status: 404 })
  }
  const supabase = ensureAdminClient()
  const { error: viewError } = await supabase
    .from('questionnaire_links')
    .update({ views_count: (link.views_count || 0) + 1 })
    .eq('id', link.id)
  if (viewError) {
    console.warn('[public/cuestionarios] No se pudo registrar apertura', {
      linkId: link.id,
      error: viewError.message
    })
  }

  return NextResponse.json({
    questionnaire: {
      id: link.questionnaire.id,
      titulo: link.questionnaire.titulo,
      descripcion: link.questionnaire.descripcion,
      secciones: link.questionnaire.secciones,
      requiere_ppr: link.questionnaire.requiere_ppr,
      version: link.questionnaire_version
    },
    agent: {
      code: link.agent_code,
      name: link.agente.nombre
    },
    event: {
      id: link.cal_event_type_id,
      title: link.cal_event_title,
      booking_url: link.cal_booking_url
    }
  })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params
  const { link, error } = await resolvePublicQuestionnaireLink(token)
  if (error) return NextResponse.json({ error }, { status: 500 })
  if (!link || !link.questionnaire.activo) {
    return NextResponse.json({ error: 'Este enlace no está disponible' }, { status: 404 })
  }

  const body = await req.json().catch(() => null) as {
    action?: 'submit' | 'ppr' | 'prepare_booking'
    answers?: Record<string, unknown>
    submission_id?: string
    ppr_plan?: PprPlanKey
  } | null
  if (!body) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })

  const supabase = ensureAdminClient()
  if (body.action === 'ppr') {
    if (!body.submission_id || !body.ppr_plan || !['65', '15', '10'].includes(body.ppr_plan)) {
      return NextResponse.json({ error: 'Selecciona un plan para la simulación PPR' }, { status: 400 })
    }
    const { data: submission, error: submissionError } = await supabase
      .from('questionnaire_submissions')
      .select('id,respuestas,questionnaire_snapshot,estado,prospecto_id')
      .eq('id', body.submission_id)
      .eq('link_id', link.id)
      .maybeSingle()
    if (submissionError) return NextResponse.json({ error: submissionError.message }, { status: 500 })
    if (!submission) return NextResponse.json({ error: 'Respuesta no encontrada' }, { status: 404 })

    const submissionSnapshot = submission.questionnaire_snapshot as { secciones?: QuestionnaireSection[] }
    const semantic = extractSemanticAnswers(
      submissionSnapshot.secciones || [],
      submission.respuestas as Record<string, unknown>
    )
    let pprResult
    try {
      pprResult = await calculatePpr(Number(semantic.edad), body.ppr_plan)
    } catch (calculationError) {
      return NextResponse.json({
        error: calculationError instanceof Error ? calculationError.message : 'No se pudo calcular la simulación'
      }, { status: 409 })
    }
    const { data, error: updateError } = await supabase
      .from('questionnaire_submissions')
      .update({
        ppr_result: pprResult,
        estado: 'simulacion_completa',
        updated_at: new Date().toISOString()
      })
      .eq('id', body.submission_id)
      .eq('link_id', link.id)
      .select('id')
      .maybeSingle()
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Respuesta no encontrada' }, { status: 404 })
    if (submission.prospecto_id) {
      const prospectoId = Number(submission.prospecto_id)
      const { data: prospect, error: prospectError } = await supabase
        .from('prospectos')
        .select('notas')
        .eq('id', prospectoId)
        .maybeSingle()
      if (prospectError) return NextResponse.json({ error: prospectError.message }, { status: 500 })

      const { error: notesError } = await supabase
        .from('prospectos')
        .update({
          notas: upsertPprNote(prospect?.notas, pprResult),
          updated_at: new Date().toISOString()
        })
        .eq('id', prospectoId)
      if (notesError) return NextResponse.json({ error: notesError.message }, { status: 500 })
    }
    if (submission.estado !== 'simulacion_completa' && submission.estado !== 'cita_agendada') {
      const prospectName = String(semantic.nombre || '').trim() || 'Prospecto'
      const prospectEmail = typeof semantic.email === 'string' ? semantic.email : null
      void notifyQuestionnaireAgent(supabase, {
        event: 'ppr_simulated',
        agenteId: link.agente_id,
        agentAuthId: link.agente.id_auth,
        prospectName,
        prospectEmail,
        questionnaireTitle: link.questionnaire.titulo,
        agentCode: link.agent_code,
        submissionId: submission.id,
        prospectoId: submission.prospecto_id ? Number(submission.prospecto_id) : null,
        sendEmail: false
      })
    }
    return NextResponse.json({ success: true, result: pprResult })
  }

  if (body.action === 'prepare_booking') {
    if (!body.submission_id) {
      return NextResponse.json({ error: 'Respuesta no encontrada' }, { status: 400 })
    }
    const { data: submission, error: submissionError } = await supabase
      .from('questionnaire_submissions')
      .select('id,respuestas,questionnaire_snapshot,estado,prospecto_id,ppr_result')
      .eq('id', body.submission_id)
      .eq('link_id', link.id)
      .maybeSingle()
    if (submissionError) return NextResponse.json({ error: submissionError.message }, { status: 500 })
    if (!submission) return NextResponse.json({ error: 'Respuesta no encontrada' }, { status: 404 })
    if (link.questionnaire.requiere_ppr && submission.estado !== 'simulacion_completa' && submission.estado !== 'cita_agendada') {
      return NextResponse.json({ error: 'Completa la simulación PPR antes de agendar' }, { status: 409 })
    }

    const snapshot = submission.questionnaire_snapshot as { secciones?: QuestionnaireSection[]; titulo?: string }
    let ensured
    try {
      ensured = await ensureQuestionnaireProspect(supabase, {
        agenteId: Number(link.agente_id),
        questionnaireTitle: snapshot.titulo || link.questionnaire.titulo,
        agentCode: link.agent_code,
        sections: snapshot.secciones || [],
        answers: submission.respuestas as Record<string, unknown>,
        requierePpr: link.questionnaire.requiere_ppr,
        pprResult: submission.ppr_result && typeof submission.ppr_result === 'object'
          ? submission.ppr_result as PprResult
          : null,
        existingProspectId: submission.prospecto_id ? Number(submission.prospecto_id) : null
      })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo preparar el prospecto' }, { status: 500 })
    }

    if (Number(submission.prospecto_id || 0) !== ensured.prospectId) {
      const { error: updateError } = await supabase
        .from('questionnaire_submissions')
        .update({ prospecto_id: ensured.prospectId, updated_at: new Date().toISOString() })
        .eq('id', submission.id)
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    void logAccion('preparar_agenda_cuestionario', {
      tabla_afectada: 'prospectos',
      id_registro: ensured.prospectId,
      snapshot: {
        submission_id: submission.id,
        prospecto_id: ensured.prospectId,
        created: ensured.created,
        agent_code: link.agent_code
      }
    })

    return NextResponse.json({
      success: true,
      prospecto_id: ensured.prospectId,
      contact: ensured.contact
    })
  }

  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}
  const sections = link.questionnaire.secciones as QuestionnaireSection[]
  const validationErrors = validateQuestionnaireAnswers(sections, answers)
  if (validationErrors.length) {
    return NextResponse.json({ error: validationErrors[0], errors: validationErrors }, { status: 400 })
  }
  let ensured
  try {
    ensured = await ensureQuestionnaireProspect(supabase, {
      agenteId: Number(link.agente_id),
      questionnaireTitle: link.questionnaire.titulo,
      agentCode: link.agent_code,
      sections,
      answers,
      requierePpr: link.questionnaire.requiere_ppr
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo registrar al prospecto' }, { status: 400 })
  }

  const snapshot = {
    id: link.questionnaire.id,
    titulo: link.questionnaire.titulo,
    descripcion: link.questionnaire.descripcion,
    secciones: link.questionnaire.secciones,
    version: link.questionnaire_version,
    agent_code: link.agent_code,
    cal_event_type_id: link.cal_event_type_id
  }
  const { data: submission, error: submissionError } = await supabase
    .from('questionnaire_submissions')
    .insert({
      link_id: link.id,
      questionnaire_id: link.questionnaire.id,
      questionnaire_snapshot: snapshot,
      respuestas: answers,
      estado: 'cuestionario_completo',
      prospecto_id: ensured.prospectId
    })
    .select('id')
    .single()
  if (submissionError) return NextResponse.json({ error: submissionError.message }, { status: 500 })

  void logAccion('cuestionario_prospecto_completado', {
    tabla_afectada: 'questionnaire_submissions',
    snapshot: {
      submission_id: submission.id,
      prospecto_id: ensured.prospectId,
      questionnaire_id: link.questionnaire.id,
      agent_code: link.agent_code
    }
  })
  void notifyQuestionnaireAgent(supabase, {
    event: 'completed',
    agenteId: link.agente_id,
    agentAuthId: link.agente.id_auth,
    prospectName: ensured.contact.nombre,
    prospectEmail: ensured.contact.email,
    questionnaireTitle: link.questionnaire.titulo,
    agentCode: link.agent_code,
    submissionId: submission.id,
    prospectoId: ensured.prospectId,
    sendEmail: !link.questionnaire.requiere_ppr
  })

  return NextResponse.json({
    submission_id: submission.id,
    prospecto_id: ensured.prospectId,
    contact: ensured.contact,
    requiere_ppr: link.questionnaire.requiere_ppr
  }, { status: 201 })
}
