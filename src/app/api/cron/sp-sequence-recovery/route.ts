import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { sendDirectMessage, getSendPilotApiKey } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const supabase = ensureAdminClient()

/**
 * GET /api/cron/sp-sequence-recovery
 *
 * CRM backup for the SendPilot outreach sequence.
 * For every lead still in 'en_secuencia', checks which sequence steps SP has
 * already sent (tracked via sp_mensaje_enviado → metadata.sequenceStep) and
 * which the CRM has already sent (crm_secuencia_enviado → metadata.paso).
 * If the next uncovered step is overdue, the CRM sends it via SP's direct
 * message API — acting as a fallback when SP misses a step (paused, rate-
 * limited, or sequence exhausted early with DONE).
 *
 * Algorithm per lead:
 *  1. Build coveredSteps = {SP sequenceStep numbers} ∪ {CRM paso numbers}
 *  2. Find nextPaso = first paso in sp_secuencia_pasos not in coveredSteps
 *  3. Check (today - lastOutbound) >= nextPaso.dias_espera
 *     – lastOutbound falls back to lead.created_at when no activities exist
 *  4. If overdue: interpolate + send + log crm_secuencia_enviado
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expectedAuth = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : undefined
  if (expectedAuth && authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  let sent = 0
  let skipped = 0
  let errors = 0
  const details: string[] = []
  const DETAILS_CAP = 200
  const pushDetail = (msg: string) => { if (details.length < DETAILS_CAP) details.push(msg) }

  // Global daily message budget: SP sender is capped at 100 messages/day by LinkedIn.
  // Cap total sends per cron run to 75, leaving a 25-message safety margin.
  // The cron runs hourly so the backlog drains at ~75/hour (all excess leads carry over to next run).
  const MAX_SENDS_PER_RUN = 75

  // Pre-fetch SP API key once — avoids one DB round-trip per send (getSendPilotApiKey
  // is called inside spFetch, so without this we'd make N hidden queries).
  const spApiKey = await getSendPilotApiKey() ?? undefined

  // Get all active campaigns
  const { data: campanas } = await supabase
    .from('sp_campanas')
    .select('id, nombre, sendpilot_campaign_id, sp_sender_ids')
    .eq('estado', 'activa')

  if (!campanas?.length) return NextResponse.json({ sent, skipped, errors, details })

  for (const campana of campanas) {
    // Get active sequence steps ordered by paso
    const { data: pasos } = await supabase
      .from('sp_secuencia_pasos')
      .select('id, paso, dias_espera, mensaje')
      .eq('campana_id', campana.id)
      .eq('activo', true)
      .order('paso', { ascending: true })

    if (!pasos?.length) continue

    const senderIds = (campana.sp_sender_ids as string[]) ?? []
    const senderId = senderIds[0]
    if (!senderId) {
      const warnMsg = `Campaña "${campana.nombre}" sin sp_sender_ids — sincroniza la campaña desde SP primero`
      console.warn(`[cron/sp-sequence-recovery] ${warnMsg}`)
      details.push(`SKIP campaña: ${warnMsg}`)
      skipped++
      continue
    }

    // CRM acts as fallback for ALL leads in 'en_secuencia' — not only those where
    // SP has finished (sp_secuencia_terminada). This allows the CRM to cover any
    // step that SP missed, regardless of whether SP reported DONE.
    const { data: leads } = await supabase
      .from('sp_precandidatos')
      .select('id, nombre, apellido, linkedin_url, sp_contact_id, created_at')
      .eq('campana_id', campana.id)
      .eq('estado', 'en_secuencia')

    if (!leads?.length) continue

    // Batch-fetch all outbound activities for all leads in this campaign at once
    // to avoid N+1 queries (one per lead).
    const leadIds = leads.map(l => l.id)
    const { data: todasActividades } = await supabase
      .from('sp_actividades')
      .select('precandidato_id, tipo, created_at, metadata')
      .in('precandidato_id', leadIds)
      .in('tipo', ['sp_conexion_enviada', 'sp_mensaje_enviado', 'crm_secuencia_enviado'])
      .order('created_at', { ascending: false })

    // Index by precandidato_id for O(1) lookup
    const actividadesByLead = new Map<string, typeof todasActividades>()
    for (const a of todasActividades ?? []) {
      const key = a.precandidato_id as string
      if (!actividadesByLead.has(key)) actividadesByLead.set(key, [])
      actividadesByLead.get(key)!.push(a)
    }

    // --- Phase 1: decide who needs a send (pure in-memory, no I/O) ---
    type SendTask = {
      lead: (typeof leads)[number]
      leadLabel: string
      nextPaso: (typeof pasos)[number]
      mensaje: string
    }
    const sendTasks: SendTask[] = []
    // Aggregate skip reasons for this campaign — reported as a single summary line
    const skipReasons: Record<string, number> = {}
    const countSkip = (reason: string) => { skipReasons[reason] = (skipReasons[reason] ?? 0) + 1; skipped++ }

    for (const lead of leads) {
      if (!lead.linkedin_url) { countSkip('no_linkedin_url'); continue }

      const actividades = actividadesByLead.get(lead.id) ?? []

      // Build the set of steps already covered:
      //   - SP steps: sp_mensaje_enviado → metadata.sequenceStep (1-based, matches paso)
      //   - CRM steps: crm_secuencia_enviado → metadata.paso
      const coveredSteps = new Set<number>()
      for (const a of actividades) {
        if (a.tipo === 'sp_mensaje_enviado') {
          const step = Number((a.metadata as Record<string, unknown>)?.sequenceStep)
          if (!isNaN(step) && step > 0) coveredSteps.add(step)
        } else if (a.tipo === 'crm_secuencia_enviado') {
          const paso = Number((a.metadata as Record<string, unknown>)?.paso)
          if (!isNaN(paso) && paso > 0) coveredSteps.add(paso)
        }
      }

      // Find the first uncovered step
      const nextPaso = pasos.find(p => !coveredSteps.has(p.paso))
      if (!nextPaso) { countSkip('all_steps_covered'); continue }

      // Timing check: days since last sequence message (sp_mensaje_enviado or crm_secuencia_enviado).
      // sp_conexion_enviada is intentionally excluded — its created_at reflects when the webhook
      // was processed by the CRM, not when SP actually sent the connection, so using it would
      // incorrectly reset the timer to near-zero whenever a connection webhook arrives late.
      //
      // For paso 1 with no prior sequence messages: skip the timing gate entirely.
      // The CRM has no reliable "connection sent at" timestamp (only the webhook arrival time),
      // so we cannot know how long ago SP actually sent the connection. If paso 1 is uncovered
      // we send it immediately — that is the whole point of the recovery job.
      const lastSequenceMsg = actividades.find(
        a => a.tipo === 'sp_mensaje_enviado' || a.tipo === 'crm_secuencia_enviado'
      )
      if (lastSequenceMsg) {
        const daysSince = (now.getTime() - new Date(lastSequenceMsg.created_at).getTime()) / (1000 * 60 * 60 * 24)
        if (daysSince < nextPaso.dias_espera) { countSkip(`waiting_paso${nextPaso.paso}_${nextPaso.dias_espera}d`); continue }
      }
      // else: no prior sequence messages → paso 1, send immediately regardless of dias_espera

      // Guard for paso 1: LinkedIn direct messages require a 1st-degree connection.
      // For bulk-imported leads SP may not have sent (or had accepted) the connection request yet.
      // Paso 2+ implies paso 1 was already delivered successfully, so the connection exists.
      if (nextPaso.paso === 1 && !actividades.some(a => a.tipo === 'sp_conexion_enviada')) {
        countSkip('paso1_no_connection_yet'); continue
      }

      // Interpolate template variables:
      //   {nombre}   → first name
      //   {cal_url}  → Cal.com scheduling link for this lead
      const leadLabel = `${lead.nombre ?? ''} ${lead.apellido ?? ''}`.trim() || lead.id
      const nombre = [lead.nombre, lead.apellido].filter(Boolean).join(' ').split(' ')[0] || ''
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lealtiagestiondev.vercel.app'
      const calUrl = `${baseUrl}/api/cal/${campana.sendpilot_campaign_id}/${lead.sp_contact_id ?? ''}`
      const mensaje = nextPaso.mensaje
        .replace(/\{nombre\}/gi, nombre)
        .replace(/\{cal_url\}/gi, calUrl)

      sendTasks.push({ lead, leadLabel, nextPaso, mensaje })
    }

    // Emit one summary line per campaign instead of one line per skipped lead
    if (Object.keys(skipReasons).length > 0) {
      const summary = Object.entries(skipReasons).map(([r, n]) => `${r}:${n}`).join(', ')
      pushDetail(`[${campana.nombre}] skipped ${Object.values(skipReasons).reduce((a, b) => a + b, 0)} — ${summary}`)
    }

    // --- Phase 2: fire sends in parallel (batches of 3, global cap applied) ---
    // Concurrency=3 avoids hammering SP's API.
    // Global budget (MAX_SENDS_PER_RUN=75) is shared across all campaigns in this run.
    const CONCURRENCY = 3
    const remainingBudget = Math.max(0, MAX_SENDS_PER_RUN - sent)
    const cappedTasks = sendTasks.slice(0, remainingBudget)
    if (sendTasks.length > remainingBudget) {
      pushDetail(`CAP: ${sendTasks.length} eligible sends, budget allows ${remainingBudget} more this run (${sent} already sent)`)
    }

    for (let i = 0; i < cappedTasks.length; i += CONCURRENCY) {
      await Promise.allSettled(
        cappedTasks.slice(i, i + CONCURRENCY).map(async ({ lead, leadLabel, nextPaso, mensaje }) => {
          try {
            await sendDirectMessage(senderId, lead.linkedin_url!, mensaje, undefined, spApiKey)
            await supabase.from('sp_actividades').insert({
              precandidato_id: lead.id,
              campana_id: campana.id,
              tipo: 'crm_secuencia_enviado',
              metadata: { paso: nextPaso.paso, paso_id: nextPaso.id, sender_id: senderId },
            })
            const msg = `SENT paso ${nextPaso.paso} to ${leadLabel}`
            console.log(`[cron/sp-sequence-recovery] ${msg}`)
            pushDetail(msg)
            sent++
          } catch (err) {
            const msg = `ERROR sending to ${leadLabel}: ${err instanceof Error ? err.message : String(err)}`
            console.error(`[cron/sp-sequence-recovery] ${msg}`)
            pushDetail(msg)
            errors++
          }
        })
      )
    }
  }

  return NextResponse.json({ sent, skipped, errors, details, ts: now.toISOString() })
}
