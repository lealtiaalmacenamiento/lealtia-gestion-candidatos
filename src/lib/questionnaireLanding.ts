import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCalcomDefaultEventType } from '@/lib/integrations/calcom'

export const LANDING_PPR_PARAM_TYPE = 'landing'
export const LANDING_PPR_PARAM_KEY = 'ppr_questionnaire_id'

interface QuestionnaireRow {
  id: string
  slug: string
  version: number
  titulo: string
  descripcion: string | null
  secciones: unknown
  requiere_ppr: boolean
  activo: boolean
}

interface AgentRow {
  agente_id: number
  id_auth: string | null
  nombre?: string | null
  email?: string | null
}

async function getConfiguredQuestionnaireId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('Parametros')
    .select('valor')
    .eq('tipo', LANDING_PPR_PARAM_TYPE)
    .eq('clave', LANDING_PPR_PARAM_KEY)
    .order('id', { ascending: false })
    .limit(1)
  const value = data?.[0]?.valor
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function getLandingPprQuestionnaire(
  supabase: SupabaseClient
): Promise<{ questionnaire: QuestionnaireRow | null; configuredId: string | null; error?: string }> {
  const configuredId = await getConfiguredQuestionnaireId(supabase).catch(() => null)
  if (configuredId) {
    const { data, error } = await supabase
      .from('questionnaires')
      .select('id,slug,version,titulo,descripcion,secciones,requiere_ppr,activo')
      .eq('id', configuredId)
      .eq('activo', true)
      .maybeSingle()
    if (error) return { questionnaire: null, configuredId, error: error.message }
    if (data) return { questionnaire: data as QuestionnaireRow, configuredId }
  }

  const { data: bySlug } = await supabase
    .from('questionnaires')
    .select('id,slug,version,titulo,descripcion,secciones,requiere_ppr,activo')
    .eq('slug', 'diagnostico-ppr')
    .eq('activo', true)
    .maybeSingle()
  if (bySlug) return { questionnaire: bySlug as QuestionnaireRow, configuredId }

  const { data, error } = await supabase
    .from('questionnaires')
    .select('id,slug,version,titulo,descripcion,secciones,requiere_ppr,activo')
    .eq('requiere_ppr', true)
    .eq('activo', true)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) return { questionnaire: null, configuredId, error: error.message }
  return { questionnaire: (data?.[0] as QuestionnaireRow | undefined) ?? null, configuredId }
}

export async function saveLandingPprQuestionnaire(
  supabase: SupabaseClient,
  questionnaireId: string,
  actorEmail?: string | null
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from('Parametros')
    .select('id')
    .eq('tipo', LANDING_PPR_PARAM_TYPE)
    .eq('clave', LANDING_PPR_PARAM_KEY)
    .order('id', { ascending: false })
    .limit(1)
  if (existingError) throw new Error(existingError.message)

  const payload = {
    valor: questionnaireId,
    descripcion: 'Cuestionario PPR usado desde el botón de la landing principal',
    actualizado_por: actorEmail ?? null,
    actualizado_en: new Date().toISOString()
  }

  const existingId = existing?.[0]?.id
  if (existingId) {
    const { error } = await supabase
      .from('Parametros')
      .update(payload)
      .eq('id', existingId)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await supabase
    .from('Parametros')
    .insert({
      tipo: LANDING_PPR_PARAM_TYPE,
      clave: LANDING_PPR_PARAM_KEY,
      ...payload
    })
  if (error) throw new Error(error.message)
}

async function getActiveAgentCode(
  supabase: SupabaseClient,
  agenteId: number,
  preferredCode?: string | null
): Promise<string | null> {
  if (preferredCode) {
    const { data } = await supabase
      .from('agent_codes')
      .select('code')
      .eq('agente_id', agenteId)
      .eq('code', preferredCode)
      .eq('activo', true)
      .maybeSingle()
    if (data?.code) return data.code
  }

  const { data } = await supabase
    .from('agent_codes')
    .select('code')
    .eq('agente_id', agenteId)
    .eq('activo', true)
    .order('created_at', { ascending: false })
    .limit(1)
  return data?.[0]?.code ?? null
}

async function resolveAgentEventType(
  _supabase: SupabaseClient,
  agent: AgentRow
): Promise<{ id: number; title: string | null; bookingUrl: string | null }> {
  if (!agent.id_auth) throw new Error('El agente no tiene identidad de acceso')
  const { eventType } = await resolveCalcomDefaultEventType(agent.id_auth)
  return {
    id: eventType.id,
    title: eventType.title ?? null,
    bookingUrl: eventType.bookingUrl ?? null
  }
}

export async function createLandingQuestionnaireLink(
  supabase: SupabaseClient,
  input: {
    questionnaire: QuestionnaireRow
    agent: AgentRow
    preferredCode?: string | null
  }
): Promise<{ token: string; eventTitle: string | null }> {
  const agentCode = await getActiveAgentCode(
    supabase,
    input.agent.agente_id,
    input.preferredCode
  )
  if (!agentCode) throw new Error('El agente seleccionado no tiene código activo')

  const eventType = await resolveAgentEventType(supabase, input.agent)
  const token = randomBytes(24).toString('base64url')
  const { error } = await supabase
    .from('questionnaire_links')
    .insert({
      token,
      questionnaire_id: input.questionnaire.id,
      questionnaire_version: input.questionnaire.version,
      questionnaire_snapshot: {
        id: input.questionnaire.id,
        slug: input.questionnaire.slug,
        titulo: input.questionnaire.titulo,
        descripcion: input.questionnaire.descripcion,
        secciones: input.questionnaire.secciones,
        requiere_ppr: input.questionnaire.requiere_ppr,
        version: input.questionnaire.version
      },
      agente_id: input.agent.agente_id,
      agent_code: agentCode,
      cal_event_type_id: eventType.id,
      cal_event_title: eventType.title,
      cal_booking_url: eventType.bookingUrl,
      created_by: null
    })

  if (error) throw new Error(error.message)
  return { token, eventTitle: eventType.title }
}
