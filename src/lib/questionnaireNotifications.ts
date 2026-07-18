import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyCrmUsers, type CrmNotificationRecipient } from '@/lib/crmNotifications'
import { sendMail } from '@/lib/mailer'
import { extractSemanticAnswers, type QuestionnaireSection } from '@/lib/validation/questionnaireSchemas'

export type QuestionnaireNotificationEvent =
  | 'completed'
  | 'ppr_simulated'
  | 'booking_scheduled'

type AnswerRow = {
  section: string
  label: string
  value: string
}

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const number = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDateTime(iso?: string | null) {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: process.env.AGENDA_TZ || 'America/Mexico_City'
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function eventCopy(event: QuestionnaireNotificationEvent, prospectName: string, questionnaireTitle: string, start?: string | null) {
  if (event === 'ppr_simulated') {
    return {
      title: 'Simulación PPR realizada',
      message: `${prospectName} realizó la simulación PPR de ${questionnaireTitle}.`,
      subject: `Simulación PPR realizada - ${prospectName}`,
      heading: 'Simulación PPR realizada',
      intro: `${prospectName} completó la simulación PPR.`
    }
  }
  if (event === 'booking_scheduled') {
    const when = formatDateTime(start)
    return {
      title: 'Nueva cita desde cuestionario',
      message: `${prospectName} agendó una sesión${when ? ` para ${when}` : ''}.`,
      subject: `Nueva cita agendada - ${prospectName}`,
      heading: 'Nueva cita agendada',
      intro: `${prospectName} agendó una sesión desde el flujo de cuestionario y simulación PPR.`
    }
  }
  return {
    title: 'Cuestionario completado',
    message: `${prospectName} completó el cuestionario ${questionnaireTitle}.`,
    subject: `Cuestionario completado - ${prospectName}`,
    heading: 'Cuestionario completado',
    intro: `${prospectName} completó el cuestionario público.`
  }
}

function formatAnswerValue(value: unknown): string {
  if (value == null || value === '') return 'Sin respuesta'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (Array.isArray(value)) return value.length ? value.map(formatAnswerValue).join(', ') : 'Sin respuesta'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function getAnswerRows(sections: QuestionnaireSection[], answers: Record<string, unknown>): AnswerRow[] {
  const rows: AnswerRow[] = []
  for (const section of sections) {
    for (const question of section.preguntas) {
      rows.push({
        section: section.titulo,
        label: question.etiqueta,
        value: formatAnswerValue(answers[question.id])
      })
    }
  }
  return rows
}

function pprRows(ppr: Record<string, unknown> | null) {
  if (!ppr) return []
  const row = (label: string, value: unknown) => ({ label, value: String(value ?? 'No disponible') })
  const moneyValue = (value: unknown) => typeof value === 'number' ? money.format(value) : 'No disponible'
  const numberValue = (value: unknown) => typeof value === 'number' ? number.format(value) : 'No disponible'
  return [
    row('Plan seleccionado', ppr.planNombre || ppr.plan),
    row('Edad usada para cálculo', ppr.edad ? `${ppr.edad} años` : 'No disponible'),
    row('Años de pago', ppr.aniosPago ? `${ppr.aniosPago} años` : 'No disponible'),
    row('Aportación anual', moneyValue(ppr.primaAnualMXN)),
    row('Aportación mensual', moneyValue(ppr.primaMensualMXN)),
    row('Prima anual en UDI', `${numberValue(ppr.primaAnualUDI)} UDIs`),
    row('Total aportado estimado', moneyValue(ppr.totalAportadoMXN)),
    row('Meta estimada a los 65', moneyValue(ppr.meta65MXN)),
    row('Deducción ISR estimada', moneyValue(ppr.deduccionISR_MXN)),
    row('Ahorro más beneficio fiscal', moneyValue(ppr.totalAhorroMXN))
  ]
}

function tableHtml(headers: string[], rows: string[][]) {
  if (!rows.length) return '<p style="margin:0;color:#607d8b">Sin información disponible.</p>'
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr>${headers.map(h => `<th style="text-align:left;border-bottom:1px solid #dce3e8;padding:8px;color:#004481">${escapeHtml(h)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map(row => `<tr>${row.map(cell => `<td style="vertical-align:top;border-bottom:1px solid #eef2f5;padding:8px;color:#263238">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>`
}

function sectionHtml(title: string, content: string) {
  return `
    <div style="margin:18px 0;padding:16px;border:1px solid #e5eaee;border-radius:8px;background:#fbfcfd">
      <h3 style="margin:0 0 12px;color:#004481;font-size:16px">${escapeHtml(title)}</h3>
      ${content}
    </div>`
}

function uniqueEmails(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const email = raw?.trim().toLowerCase()
    if (!email || !email.includes('@') || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

async function loadSubmissionDetails(supabase: SupabaseClient, submissionId?: string | null) {
  if (!submissionId) return null
  const { data } = await supabase
    .from('questionnaire_submissions')
    .select('respuestas,questionnaire_snapshot,ppr_result,booking_start,booking_end')
    .eq('id', submissionId)
    .maybeSingle()
  if (!data) return null
  const snapshot = data.questionnaire_snapshot &&
    typeof data.questionnaire_snapshot === 'object' &&
    !Array.isArray(data.questionnaire_snapshot)
    ? data.questionnaire_snapshot as { secciones?: QuestionnaireSection[]; titulo?: string }
    : {}
  const sections = Array.isArray(snapshot.secciones) ? snapshot.secciones : []
  const answers = data.respuestas && typeof data.respuestas === 'object'
    ? data.respuestas as Record<string, unknown>
    : {}
  const ppr = data.ppr_result && typeof data.ppr_result === 'object'
    ? data.ppr_result as Record<string, unknown>
    : null
  return {
    title: snapshot.titulo,
    answers,
    sections,
    answerRows: getAnswerRows(sections, answers),
    semantic: extractSemanticAnswers(sections, answers),
    ppr,
    bookingStart: data.booking_start as string | null,
    bookingEnd: data.booking_end as string | null
  }
}

async function getSupervisors(supabase: SupabaseClient): Promise<CrmNotificationRecipient[]> {
  const { data } = await supabase
    .from('usuarios')
    .select('id_auth,email,nombre')
    .eq('rol', 'supervisor')
    .eq('activo', true)
  return (data || []).map(user => ({
    id_auth: user.id_auth ?? null,
    email: user.email ?? null,
    nombre: user.nombre ?? null
  }))
}

function buildDetailedEmail(input: {
  heading: string
  intro: string
  questionnaireTitle: string
  prospectName: string
  prospectEmail?: string | null
  agentName?: string | null
  agentEmail?: string | null
  agentCode?: string | null
  answerRows: AnswerRow[]
  ppr: Record<string, unknown> | null
  bookingStart?: string | null
  bookingEnd?: string | null
}) {
  const year = new Date().getFullYear()
  const LOGO_URL = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || 'https://via.placeholder.com/140x50?text=Lealtia'
  const ppr = pprRows(input.ppr)
  const bookingStart = formatDateTime(input.bookingStart)
  const bookingEnd = formatDateTime(input.bookingEnd)
  const details = [
    ['Prospecto', input.prospectName],
    ['Correo del prospecto', input.prospectEmail || 'No disponible'],
    ['Asesor', input.agentName || input.agentEmail || 'No disponible'],
    ['Código de agente', input.agentCode || 'No disponible'],
    ['Cuestionario', input.questionnaireTitle]
  ]
  if (bookingStart) details.push(['Cita agendada', bookingEnd ? `${bookingStart} - ${bookingEnd}` : bookingStart])

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:760px;margin:auto;border:1px solid #ddd;border-radius:10px;overflow:hidden">
    <div style="background:#004481;color:#fff;padding:18px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">${escapeHtml(input.heading)}</h2>
    </div>
    <div style="padding:24px;background:#fff">
      <p style="margin:0 0 14px;color:#263238;line-height:1.55">${escapeHtml(input.intro)}</p>
      ${sectionHtml('Resumen', tableHtml(['Dato', 'Valor'], details))}
      ${sectionHtml('Respuestas del cuestionario', tableHtml(['Sección', 'Pregunta', 'Respuesta'], input.answerRows.map(row => [row.section, row.label, row.value])))}
      ${sectionHtml('Simulación PPR', ppr.length ? tableHtml(['Dato', 'Valor'], ppr.map(row => [row.label, row.value])) : '<p style="margin:0;color:#607d8b">La simulación PPR aún no se ha realizado.</p>')}
      <p style="margin:16px 0 0;color:#607d8b;font-size:12px;line-height:1.5">La simulación es informativa y deberá validarse con el asesor.</p>
    </div>
    <div style="background:#f4f4f4;color:#555;font-size:12px;padding:14px;text-align:center;line-height:1.4">
      <p style="margin:0">© ${year} Lealtia — Todos los derechos reservados</p>
    </div>
  </div>`

  const textLines = [
    input.heading,
    '',
    input.intro,
    '',
    'Resumen:',
    ...details.map(([label, value]) => `- ${label}: ${value}`),
    '',
    'Respuestas del cuestionario:',
    ...input.answerRows.map(row => `- ${row.section} / ${row.label}: ${row.value}`),
    '',
    'Simulación PPR:',
    ...(ppr.length ? ppr.map(row => `- ${row.label}: ${row.value}`) : ['- La simulación PPR aún no se ha realizado.']),
    '',
    `© ${year} Lealtia`
  ]
  return { html, text: textLines.join('\n') }
}

export async function notifyQuestionnaireAgent(
  supabase: SupabaseClient,
  input: {
    event: QuestionnaireNotificationEvent
    agenteId: number
    agentAuthId?: string | null
    prospectName: string
    prospectEmail?: string | null
    questionnaireTitle: string
    agentCode?: string | null
    submissionId?: string | null
    prospectoId?: number | null
    bookingUid?: string | null
    bookingStart?: string | null
    sendEmail?: boolean
  }
) {
  const [{ data: agent }, details, supervisors] = await Promise.all([
    input.agentAuthId
      ? supabase
          .from('usuarios')
          .select('id_auth,email,nombre')
          .eq('id_auth', input.agentAuthId)
          .maybeSingle()
      : supabase
          .from('usuarios')
          .select('id_auth,email,nombre')
          .eq('id', input.agenteId)
          .maybeSingle(),
    loadSubmissionDetails(supabase, input.submissionId),
    getSupervisors(supabase)
  ])

  const prospectName = input.prospectName || String(details?.semantic.nombre || '').trim() || 'Un prospecto'
  const prospectEmail = input.prospectEmail || (typeof details?.semantic.email === 'string' ? details.semantic.email : null)
  const questionnaireTitle = details?.title || input.questionnaireTitle
  const recipient = {
    id_auth: agent?.id_auth ?? input.agentAuthId ?? null,
    email: agent?.email ?? null,
    nombre: agent?.nombre ?? null
  }
  const copy = eventCopy(input.event, prospectName, questionnaireTitle, input.bookingStart || details?.bookingStart)
  const dedupeBase = input.bookingUid || input.submissionId || input.prospectoId || `${input.agenteId}:${prospectEmail || prospectName}`
  const dedupeKey = `questionnaire:${input.event}:${dedupeBase}`

  const { data: existingNotifications } = await supabase
    .from('notificaciones')
    .select('id')
    .contains('metadata', { dedupe_key: dedupeKey })
    .limit(1)
  const alreadySent = Boolean(existingNotifications?.length)

  await notifyCrmUsers(supabase, [recipient], {
    titulo: copy.title,
    mensaje: copy.message,
    dedupeKey,
    metadata: {
      source: 'questionnaire_ppr',
      event: input.event,
      submission_id: input.submissionId ?? null,
      prospecto_id: input.prospectoId ?? null,
      booking_uid: input.bookingUid ?? null,
      agent_code: input.agentCode ?? null,
      prospect_email: prospectEmail ?? null
    }
  })

  if (input.sendEmail === false || alreadySent) return

  const to = uniqueEmails([prospectEmail, recipient.email])
  if (!to.length) return
  const cc = uniqueEmails(supervisors.map(supervisor => supervisor.email).filter(email => !to.includes(String(email).toLowerCase())))
  const email = buildDetailedEmail({
    heading: copy.heading,
    intro: copy.intro,
    questionnaireTitle,
    prospectName,
    prospectEmail,
    agentName: recipient.nombre,
    agentEmail: recipient.email,
    agentCode: input.agentCode,
    answerRows: details?.answerRows || [],
    ppr: details?.ppr || null,
    bookingStart: input.bookingStart || details?.bookingStart || null,
    bookingEnd: details?.bookingEnd || null
  })
  try {
    await sendMail({
      to,
      cc,
      subject: copy.subject,
      html: email.html,
      text: email.text
    })
  } catch (error) {
    console.error('[questionnaireNotifications] error enviando correo detallado', error)
  }
}
