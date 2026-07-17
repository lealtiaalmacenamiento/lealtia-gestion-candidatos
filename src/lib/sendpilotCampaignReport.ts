import type { SupabaseClient } from '@supabase/supabase-js'
import { getLeads, normalizeLinkedInSlug, type SPLead } from '@/lib/integrations/sendpilot'

const DEFAULT_TZ = process.env.AGENDA_TZ || 'America/Mexico_City'

type JsonRecord = Record<string, unknown>

export interface SendPilotReportRow {
  origen: string
  nombre: string
  empresa: string
  cargo: string
  linkedin: string
  sp_contact_id: string
  sendpilot_status: string
  crm_precandidato_id: string
  crm_estado: string
  link_agenda_enviado: 'Si' | 'No'
  link_agenda_fuente: string
  link_agenda_fecha: string
  link_agenda_url: string
  llamada_agendada: 'Si' | 'No'
  llamada_estado: string
  llamada_inicio: string
  llamada_fin: string
  calcom_booking_uid: string
  reclutador: string
  total_citas: number
  citas_vigentes: number
  citas_canceladas: number
}

export interface SendPilotCampaignReport {
  campana: {
    id: string
    nombre: string
    sendpilot_campaign_id: string
    estado: string
  }
  generatedAt: string
  rows: SendPilotReportRow[]
  csv: string
  filename: string
  summary: {
    totalRows: number
    totalSendPilotLeads: number
    totalCrmPrecandidatos: number
    totalCitas: number
    totalLinkActivities: number
    statusCounts: Record<string, number>
    linkCounts: { si: number; no: number }
    callCounts: { si: number; no: number }
    originCounts: Record<string, number>
  }
}

interface CampaignRow {
  id: string
  nombre: string
  sendpilot_campaign_id: string
  estado: string
}

interface PrecandidatoRow {
  id: string
  campana_id: string
  reclutador_id: string | null
  sp_contact_id: string | null
  nombre: string | null
  apellido: string | null
  email: string | null
  empresa: string | null
  cargo: string | null
  linkedin_url: string | null
  linkedin_slug: string | null
  estado: string | null
  calcom_booking_uid: string | null
  created_at: string | null
  updated_at: string | null
}

interface CitaRow {
  id: string
  precandidato_id: string | null
  reclutador_id: string | null
  inicio: string | null
  fin: string | null
  estado: string | null
  calcom_booking_uid: string | null
  meeting_url: string | null
  created_at: string | null
  updated_at: string | null
}

interface ActivityRow {
  precandidato_id: string | null
  tipo: string
  metadata: JsonRecord | null
  created_at: string | null
}

interface UsuarioRow {
  id_auth: string | null
  nombre: string | null
  email: string | null
}

const HEADERS: Array<keyof SendPilotReportRow> = [
  'origen',
  'nombre',
  'empresa',
  'cargo',
  'linkedin',
  'sp_contact_id',
  'sendpilot_status',
  'crm_precandidato_id',
  'crm_estado',
  'link_agenda_enviado',
  'link_agenda_fuente',
  'link_agenda_fecha',
  'link_agenda_url',
  'llamada_agendada',
  'llamada_estado',
  'llamada_inicio',
  'llamada_fin',
  'calcom_booking_uid',
  'reclutador',
  'total_citas',
  'citas_vigentes',
  'citas_canceladas',
]

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value)
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(rows: SendPilotReportRow[]): string {
  return [
    HEADERS.join(','),
    ...rows.map(row => HEADERS.map(header => csvEscape(row[header])).join(',')),
  ].join('\r\n')
}

function formatMxDate(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('es-MX', {
    timeZone: DEFAULT_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function safeSlug(raw: string | null | undefined): string {
  return normalizeLinkedInSlug(raw ?? null) ?? ''
}

function leadName(lead: SPLead, pre?: PrecandidatoRow | null): string {
  const fromLead = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim()
  if (fromLead) return fromLead
  return [pre?.nombre, pre?.apellido].filter(Boolean).join(' ').trim()
}

async function getAllSendPilotLeads(spCampaignId: string): Promise<SPLead[]> {
  const leads: SPLead[] = []
  let page = 1
  let totalPages = 1

  do {
    const result = await getLeads(spCampaignId, page, 100)
    leads.push(...result.leads)
    totalPages = result.totalPages || 1
    page += 1
  } while (page <= totalPages && page <= 200)

  return leads
}

async function resolveCampaign(
  supabase: SupabaseClient,
  campaignIdOrSendPilotId: string
): Promise<CampaignRow> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignIdOrSendPilotId)
  const query = supabase
    .from('sp_campanas')
    .select('id,nombre,sendpilot_campaign_id,estado')
    .limit(2)

  const { data, error } = isUuid
    ? await query.eq('id', campaignIdOrSendPilotId)
    : await query.ilike('sendpilot_campaign_id', campaignIdOrSendPilotId)

  if (error) throw error
  const campana = (data?.[0] ?? null) as CampaignRow | null
  if (!campana) throw new Error(`No se encontró campaña local para ${campaignIdOrSendPilotId}`)
  return campana
}

function buildLinkInfo(
  pre: PrecandidatoRow | null,
  activeCitas: CitaRow[],
  linkByPre: Map<string, ActivityRow>
) {
  const activity = pre?.id ? linkByPre.get(pre.id) : null
  const stateImpliesLink = pre
    ? ['link_enviado', 'cita_agendada', 'promovido'].includes(pre.estado ?? '')
    : false
  const hasBookingTrace = Boolean(activeCitas.length > 0 || pre?.calcom_booking_uid)
  const metadata = activity?.metadata && typeof activity.metadata === 'object' ? activity.metadata : {}
  const url = typeof metadata.cal_link === 'string' ? metadata.cal_link : ''

  return {
    link_agenda_enviado: (activity || stateImpliesLink || hasBookingTrace ? 'Si' : 'No') as 'Si' | 'No',
    link_agenda_fuente: activity
      ? 'actividad_sp_link_enviado'
      : stateImpliesLink
        ? 'estado_crm'
        : hasBookingTrace
          ? 'cita_o_uid_calcom'
          : '',
    link_agenda_fecha: formatMxDate(activity?.created_at),
    link_agenda_url: url,
  }
}

function selectedCitaForReport(citas: CitaRow[]): {
  activeCitas: CitaRow[]
  cancelledCitas: CitaRow[]
  selectedCita: CitaRow | null
} {
  const activeCitas = citas.filter(cita => cita.estado !== 'cancelada')
  const cancelledCitas = citas.filter(cita => cita.estado === 'cancelada')
  const now = Date.now()
  const futureCitas = activeCitas.filter(cita => {
    const time = cita.inicio ? new Date(cita.inicio).getTime() : Number.NaN
    return Number.isFinite(time) && time >= now
  })
  const selectedCita = futureCitas[0] || activeCitas[activeCitas.length - 1] || null
  return { activeCitas, cancelledCitas, selectedCita }
}

function buildSummary(
  rows: SendPilotReportRow[],
  totalSendPilotLeads: number,
  totalCrmPrecandidatos: number,
  totalCitas: number,
  totalLinkActivities: number
): SendPilotCampaignReport['summary'] {
  const statusCounts: Record<string, number> = {}
  const originCounts: Record<string, number> = {}
  const linkCounts = { si: 0, no: 0 }
  const callCounts = { si: 0, no: 0 }

  for (const row of rows) {
    statusCounts[row.sendpilot_status || 'SIN_STATUS'] = (statusCounts[row.sendpilot_status || 'SIN_STATUS'] || 0) + 1
    originCounts[row.origen] = (originCounts[row.origen] || 0) + 1
    linkCounts[row.link_agenda_enviado === 'Si' ? 'si' : 'no'] += 1
    callCounts[row.llamada_agendada === 'Si' ? 'si' : 'no'] += 1
  }

  return {
    totalRows: rows.length,
    totalSendPilotLeads,
    totalCrmPrecandidatos,
    totalCitas,
    totalLinkActivities,
    statusCounts,
    linkCounts,
    callCounts,
    originCounts,
  }
}

export async function buildSendPilotCampaignReport(
  supabase: SupabaseClient,
  campaignIdOrSendPilotId: string
): Promise<SendPilotCampaignReport> {
  const campana = await resolveCampaign(supabase, campaignIdOrSendPilotId)
  const spLeads = await getAllSendPilotLeads(campana.sendpilot_campaign_id)

  const { data: precandidatosData, error: precandidatosError } = await supabase
    .from('sp_precandidatos')
    .select('id,campana_id,reclutador_id,sp_contact_id,nombre,apellido,email,empresa,cargo,linkedin_url,linkedin_slug,estado,calcom_booking_uid,created_at,updated_at')
    .eq('campana_id', campana.id)
    .order('created_at', { ascending: true })
  if (precandidatosError) throw precandidatosError

  const { data: citasData, error: citasError } = await supabase
    .from('sp_citas')
    .select('id,precandidato_id,reclutador_id,inicio,fin,estado,calcom_booking_uid,meeting_url,created_at,updated_at')
    .eq('campana_id', campana.id)
    .order('inicio', { ascending: true })
  if (citasError) throw citasError

  const { data: linkActivitiesData, error: linkActivitiesError } = await supabase
    .from('sp_actividades')
    .select('precandidato_id,tipo,metadata,created_at')
    .eq('campana_id', campana.id)
    .eq('tipo', 'sp_link_enviado')
    .order('created_at', { ascending: true })
  if (linkActivitiesError) throw linkActivitiesError

  const precandidatos = (precandidatosData || []) as PrecandidatoRow[]
  const citas = (citasData || []) as CitaRow[]
  const linkActivities = (linkActivitiesData || []) as ActivityRow[]

  const recruiterIds = Array.from(new Set([
    ...precandidatos.map(pre => pre.reclutador_id),
    ...citas.map(cita => cita.reclutador_id),
  ].filter(Boolean))) as string[]

  let users: UsuarioRow[] = []
  if (recruiterIds.length > 0) {
    const { data: usersData, error: usersError } = await supabase
      .from('usuarios')
      .select('id_auth,nombre,email')
      .in('id_auth', recruiterIds)
    if (usersError) throw usersError
    users = (usersData || []) as UsuarioRow[]
  }

  const usersByAuth = new Map(users.map(user => [user.id_auth, user]))
  const preById = new Map(
    precandidatos
      .filter(pre => pre.sp_contact_id)
      .map(pre => [String(pre.sp_contact_id), pre])
  )
  const preBySlug = new Map<string, PrecandidatoRow>()
  for (const pre of precandidatos) {
    const slug = pre.linkedin_slug || safeSlug(pre.linkedin_url)
    if (slug) preBySlug.set(slug, pre)
  }

  const citasByPre = new Map<string, CitaRow[]>()
  for (const cita of citas) {
    if (!cita.precandidato_id) continue
    const current = citasByPre.get(cita.precandidato_id) || []
    current.push(cita)
    citasByPre.set(cita.precandidato_id, current)
  }

  const linkByPre = new Map<string, ActivityRow>()
  for (const activity of linkActivities) {
    if (!activity.precandidato_id) continue
    if (!linkByPre.has(activity.precandidato_id)) {
      linkByPre.set(activity.precandidato_id, activity)
    }
  }

  const rows: SendPilotReportRow[] = []
  const usedPre = new Set<string>()

  const pushRow = (input: {
    origen: string
    lead?: SPLead | null
    pre?: PrecandidatoRow | null
    sendpilotStatus: string
  }) => {
    const pre = input.pre ?? null
    if (pre?.id) usedPre.add(pre.id)
    const preCitas = pre?.id ? (citasByPre.get(pre.id) || []) : []
    const { activeCitas, cancelledCitas, selectedCita } = selectedCitaForReport(preCitas)
    const linkInfo = buildLinkInfo(pre, activeCitas, linkByPre)
    const recruiter = selectedCita?.reclutador_id
      ? usersByAuth.get(selectedCita.reclutador_id)
      : pre?.reclutador_id
        ? usersByAuth.get(pre.reclutador_id)
        : null

    rows.push({
      origen: input.origen,
      nombre: input.lead ? leadName(input.lead, pre) : [pre?.nombre, pre?.apellido].filter(Boolean).join(' ').trim(),
      empresa: pre?.empresa || '',
      cargo: pre?.cargo || '',
      linkedin: input.lead?.linkedinUrl || pre?.linkedin_url || '',
      sp_contact_id: input.lead?.id || pre?.sp_contact_id || '',
      sendpilot_status: input.sendpilotStatus,
      crm_precandidato_id: pre?.id || '',
      crm_estado: pre?.estado || 'NO_EXISTE_EN_CRM',
      link_agenda_enviado: linkInfo.link_agenda_enviado,
      link_agenda_fuente: linkInfo.link_agenda_fuente,
      link_agenda_fecha: linkInfo.link_agenda_fecha,
      link_agenda_url: linkInfo.link_agenda_url,
      llamada_agendada: activeCitas.length > 0 ? 'Si' : 'No',
      llamada_estado: selectedCita?.estado || '',
      llamada_inicio: formatMxDate(selectedCita?.inicio),
      llamada_fin: formatMxDate(selectedCita?.fin),
      calcom_booking_uid: selectedCita?.calcom_booking_uid || pre?.calcom_booking_uid || '',
      reclutador: recruiter?.nombre || recruiter?.email || '',
      total_citas: preCitas.length,
      citas_vigentes: activeCitas.length,
      citas_canceladas: cancelledCitas.length,
    })
  }

  for (const lead of spLeads) {
    const slug = safeSlug(lead.linkedinUrl)
    const pre = preById.get(String(lead.id)) || preBySlug.get(slug) || null
    pushRow({
      origen: 'SendPilot',
      lead,
      pre,
      sendpilotStatus: lead.status || '',
    })
  }

  for (const pre of precandidatos) {
    if (usedPre.has(pre.id)) continue
    pushRow({
      origen: 'CRM_sin_match_SendPilot',
      pre,
      sendpilotStatus: 'NO_ENCONTRADO_EN_SENDPILOT',
    })
  }

  rows.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const generatedAt = new Date().toISOString()
  const datePart = generatedAt.slice(0, 10)
  const safeName = campana.sendpilot_campaign_id.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase()

  return {
    campana,
    generatedAt,
    rows,
    csv: toCsv(rows),
    filename: `sendpilot_precandidatos_${safeName}_${datePart}.csv`,
    summary: buildSummary(
      rows,
      spLeads.length,
      precandidatos.length,
      citas.length,
      linkActivities.length
    ),
  }
}

