import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { sendDirectMessage } from '@/lib/integrations/sendpilot'

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

    for (const lead of leads) {
      const leadLabel = `${lead.nombre ?? ''} ${lead.apellido ?? ''}`.trim() || lead.id
      if (!lead.linkedin_url) {
        const msg = `SKIP ${leadLabel} — no linkedin_url`
        console.log(`[cron/sp-sequence-recovery] ${msg}`)
        details.push(msg)
        skipped++; continue
      }

      // Get all outbound activities for this lead, newest first
      const { data: actividades } = await supabase
        .from('sp_actividades')
        .select('tipo, created_at, metadata')
        .eq('precandidato_id', lead.id)
        .in('tipo', ['sp_conexion_enviada', 'sp_mensaje_enviado', 'crm_secuencia_enviado'])
        .order('created_at', { ascending: false })

      // Build the set of steps already covered:
      //   - SP steps: sp_mensaje_enviado → metadata.sequenceStep (1-based, matches paso)
      //   - CRM steps: crm_secuencia_enviado → metadata.paso
      const coveredSteps = new Set<number>()
      for (const a of actividades ?? []) {
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
        const msg = `SKIP ${leadLabel} — all steps covered (covered: [${[...coveredSteps].join(',')}])`
        console.log(`[cron/sp-sequence-recovery] ${msg}`)
        details.push(msg)
        skipped++; continue
      }

      // Timing check: days since last outbound activity.
      // Falls back to lead.created_at when there are no activities yet (step 1 scenario).
      const lastOutboundStr = (actividades ?? [])[0]?.created_at ?? lead.created_at
      const daysSince = (now.getTime() - new Date(lastOutboundStr).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSince < nextPaso.dias_espera) {
        const msg = `SKIP ${leadLabel} — paso ${nextPaso.paso} needs ${nextPaso.dias_espera}d, only ${daysSince.toFixed(1)}d since last outbound (${lastOutboundStr})`
        console.log(`[cron/sp-sequence-recovery] ${msg}`)
        details.push(msg)
        skipped++; continue
      }

      // Interpolate template variables:
      //   {nombre}   → first name
      //   {cal_url}  → Cal.com scheduling link for this lead
      const nombre = [lead.nombre, lead.apellido].filter(Boolean).join(' ').split(' ')[0] || ''
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lealtiagestiondev.vercel.app'
      const calUrl = `${baseUrl}/api/cal/${campana.sendpilot_campaign_id}/${lead.sp_contact_id ?? ''}`
      const mensaje = nextPaso.mensaje
        .replace(/\{nombre\}/gi, nombre)
        .replace(/\{cal_url\}/gi, calUrl)

      try {
        await sendDirectMessage(senderId, lead.linkedin_url, mensaje)

        await supabase.from('sp_actividades').insert({
          precandidato_id: lead.id,
          campana_id: campana.id,
          tipo: 'crm_secuencia_enviado',
          metadata: {
            paso: nextPaso.paso,
            paso_id: nextPaso.id,
            sender_id: senderId,
          },
        })

        const msg = `SENT paso ${nextPaso.paso} to ${leadLabel}`
        console.log(`[cron/sp-sequence-recovery] ${msg}`)
        details.push(msg)
        sent++
      } catch (err) {
        const msg = `ERROR sending to ${leadLabel}: ${err instanceof Error ? err.message : String(err)}`
        console.error(`[cron/sp-sequence-recovery] ${msg}`)
        details.push(msg)
        errors++
      }
    }
  }

  return NextResponse.json({ sent, skipped, errors, details, ts: now.toISOString() })
}
