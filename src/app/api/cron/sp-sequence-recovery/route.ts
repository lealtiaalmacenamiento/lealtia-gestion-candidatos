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

    for (const lead of leads) {
      const leadLabel = `${lead.nombre ?? ''} ${lead.apellido ?? ''}`.trim() || lead.id
      if (!lead.linkedin_url) {
        pushDetail(`SKIP ${leadLabel} — no linkedin_url`)
        skipped++; continue
      }

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
      if (!nextPaso) {
        pushDetail(`SKIP ${leadLabel} — all steps covered (covered: [${[...coveredSteps].join(',')}])`)
        skipped++; continue
      }

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
        if (daysSince < nextPaso.dias_espera) {
          pushDetail(`SKIP ${leadLabel} — paso ${nextPaso.paso} needs ${nextPaso.dias_espera}d, only ${daysSince.toFixed(1)}d since last sequence msg (${lastSequenceMsg.created_at})`)
          skipped++; continue
        }
      }
      // else: no prior sequence messages → paso 1, send immediately regardless of dias_espera

      // Interpolate template variables:
      //   {nombre}   → first name
      //   {cal_url}  → Cal.com scheduling link for this lead
      const nombre = [lead.nombre, lead.apellido].filter(Boolean).join(' ').split(' ')[0] || ''
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lealtiagestiondev.vercel.app'
      const calUrl = `${baseUrl}/api/cal/${campana.sendpilot_campaign_id}/${lead.sp_contact_id ?? ''}`
      const mensaje = nextPaso.mensaje
        .replace(/\{nombre\}/gi, nombre)
        .replace(/\{cal_url\}/gi, calUrl)

      sendTasks.push({ lead, leadLabel, nextPaso, mensaje })
    }

    // --- Phase 2: fire sends in parallel (batches of 20) ---
    // Uses pre-fetched spApiKey to skip one DB query per send.
    // Concurrency=20: worst case 533 leads → ceil(533/20)=27 batches × ~3s = ~81s (well under maxDuration=300).
    const CONCURRENCY = 20
    for (let i = 0; i < sendTasks.length; i += CONCURRENCY) {
      await Promise.allSettled(
        sendTasks.slice(i, i + CONCURRENCY).map(async ({ lead, leadLabel, nextPaso, mensaje }) => {
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
