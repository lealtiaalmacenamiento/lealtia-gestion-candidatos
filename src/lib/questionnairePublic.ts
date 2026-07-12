import { ensureAdminClient } from '@/lib/supabaseAdmin'

export interface PublicQuestionnaireLink {
  id: string
  token: string
  questionnaire_id: string
  questionnaire_version: number
  agente_id: number
  agent_code: string
  cal_event_type_id: number | null
  cal_event_title: string | null
  cal_booking_url: string | null
  views_count: number
  activo: boolean
  expires_at: string | null
  questionnaire: {
    id: string
    slug: string
    titulo: string
    descripcion: string | null
    secciones: unknown
    activo: boolean
    requiere_ppr: boolean
    version: number
  }
  agente: {
    id: number
    id_auth: string | null
    nombre: string | null
  }
}

function firstOrValue<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

export async function resolvePublicQuestionnaireLink(token: string): Promise<{
  link: PublicQuestionnaireLink | null
  error?: string
}> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return { link: null }
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('questionnaire_links')
    .select(`
      id,token,questionnaire_id,questionnaire_version,agente_id,agent_code,
      questionnaire_snapshot,
      cal_event_type_id,cal_event_title,cal_booking_url,views_count,activo,expires_at,
      questionnaire:questionnaires(id,slug,titulo,descripcion,secciones,activo,requiere_ppr,version),
      agente:usuarios(id,id_auth,nombre)
    `)
    .eq('token', token)
    .maybeSingle()
  if (error) return { link: null, error: error.message }
  if (!data?.activo) return { link: null }
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return { link: null }
  const currentQuestionnaire = firstOrValue(data.questionnaire)
  const agente = firstOrValue(data.agente)
  if (!currentQuestionnaire || !agente) return { link: null }
  const snapshot = data.questionnaire_snapshot &&
    typeof data.questionnaire_snapshot === 'object' &&
    !Array.isArray(data.questionnaire_snapshot)
    ? data.questionnaire_snapshot as Record<string, unknown>
    : {}
  const questionnaire = {
    ...currentQuestionnaire,
    titulo: typeof snapshot.titulo === 'string' ? snapshot.titulo : currentQuestionnaire.titulo,
    descripcion: typeof snapshot.descripcion === 'string' || snapshot.descripcion === null
      ? snapshot.descripcion
      : currentQuestionnaire.descripcion,
    secciones: Array.isArray(snapshot.secciones) ? snapshot.secciones : currentQuestionnaire.secciones,
    requiere_ppr: typeof snapshot.requiere_ppr === 'boolean'
      ? snapshot.requiere_ppr
      : currentQuestionnaire.requiere_ppr,
    version: Number(snapshot.version) || data.questionnaire_version,
    activo: currentQuestionnaire.activo
  }
  return {
    link: {
      ...data,
      questionnaire,
      agente
    } as unknown as PublicQuestionnaireLink
  }
}
