import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { sendDirectMessage } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const supabase = ensureAdminClient()

/**
 * GET /api/cron/sp-sequence-recovery
 *
 * Detects leads stuck in 'en_secuencia' state and sends the next configured
 * recovery step via SendPilot's direct message API.
 *
 * Logic per lead:
 *  1. Count CRM steps already sent (tipo = 'crm_secuencia_enviado')
 *  2. Find the next paso in sp_secuencia_pasos (indexed by crm steps count)
 *  3. Check if (today - last outbound activity) >= paso.dias_espera
 *  4. If yes: interpolate {nombre} and send via SP, log activity
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

  // Get all active campaigns
  const { data: campanas } = await supabase
    .from('sp_campanas')
    .select('id, nombre, sendpilot_campaign_id, sp_sender_ids')
    .eq('estado', 'activa')

  if (!campanas?.length) return NextResponse.json({ sent, skipped, errors })

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
      console.warn(`[cron/sp-sequence-recovery] Campaña "${campana.nombre}" sin sp_sender_ids — sincroniza la campaña desde SP primero`)
      skipped++
      continue
    }

    // Get all leads in sequence for this campaign
    const { data: leads } = await supabase
      .from('sp_precandidatos')
      .select('id, nombre, apellido, linkedin_url, sp_contact_id')
      .eq('campana_id', campana.id)
      .eq('estado', 'en_secuencia')

    if (!leads?.length) continue

    for (const lead of leads) {
      if (!lead.linkedin_url) { skipped++; continue }

      // Get all outbound activities for this lead, newest first
      const { data: actividades } = await supabase
        .from('sp_actividades')
        .select('tipo, created_at')
        .eq('precandidato_id', lead.id)
        .in('tipo', ['sp_conexion_enviada', 'sp_mensaje_enviado', 'crm_secuencia_enviado'])
        .order('created_at', { ascending: false })

      // How many CRM recovery steps have already been sent
      const crmStepsSent = (actividades ?? []).filter(a => a.tipo === 'crm_secuencia_enviado').length

      // All recovery steps sent — lead has received the full CRM sequence
      if (crmStepsSent >= pasos.length) { skipped++; continue }

      const nextPaso = pasos[crmStepsSent]

      // Check if enough days have passed since the last outbound message
      const lastOutbound = actividades?.[0]?.created_at
      if (lastOutbound) {
        const daysSince = (now.getTime() - new Date(lastOutbound).getTime()) / (1000 * 60 * 60 * 24)
        if (daysSince < nextPaso.dias_espera) { skipped++; continue }
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

        console.log(`[cron/sp-sequence-recovery] Sent paso ${nextPaso.paso} to lead ${lead.id} (${lead.nombre})`)
        sent++
      } catch (err) {
        console.error(`[cron/sp-sequence-recovery] Error sending to lead ${lead.id}`, err)
        errors++
      }
    }
  }

  return NextResponse.json({ sent, skipped, errors, ts: now.toISOString() })
}
