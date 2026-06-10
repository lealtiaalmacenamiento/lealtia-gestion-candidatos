import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { updateLeadStatus } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/sp-post-cita-cleanup
 *
 * Finds precandidatos stuck in 'cita_agendada' whose last confirmed future cita
 * has already passed, and reverts them to 'link_enviado' so SendPilot can follow up.
 *
 * This covers the case where a meeting happened (or was missed) but no
 * BOOKING_CANCELLED webhook was fired — Cal.com only fires that on explicit cancellations.
 *
 * Run schedule: every hour (or every 30 min) via vercel.json crons.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.REPORTES_CRON_SECRET || process.env.CRON_SECRET
  const expectedAuth = secret ? `Bearer ${secret}` : undefined
  if (expectedAuth && authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = ensureAdminClient()
  const now = new Date().toISOString()

  // Find all precandidatos in cita_agendada
  const { data: candidates, error: fetchError } = await supabase
    .from('sp_precandidatos')
    .select('id, campana_id, sp_contact_id')
    .eq('estado', 'cita_agendada')

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }
  if (!candidates?.length) {
    return NextResponse.json({ reverted: 0 })
  }

  let reverted = 0
  let skipped = 0

  for (const pre of candidates) {
    // Check if there is at least one future confirmed cita for this precandidato
    const { data: futureCitas } = await supabase
      .from('sp_citas')
      .select('id')
      .eq('precandidato_id', pre.id)
      .eq('estado', 'confirmada')
      .gt('inicio', now)
      .limit(1)

    if (futureCitas && futureCitas.length > 0) {
      // Still has a future cita — nothing to do
      skipped++
      continue
    }

    // No future citas — revert to link_enviado
    await supabase
      .from('sp_precandidatos')
      .update({
        estado: 'link_enviado',
        calcom_booking_uid: null,
        updated_at: now
      })
      .eq('id', pre.id)

    await supabase.from('sp_actividades').insert({
      precandidato_id: pre.id,
      campana_id: pre.campana_id,
      tipo: 'cita_expirada',
      metadata: { reverted_by: 'cron/sp-post-cita-cleanup', at: now }
    })

    // Sync revert back to SP (best-effort)
    if (pre.sp_contact_id) {
      updateLeadStatus(pre.sp_contact_id, 'Meeting booked').catch(() => {})
    }

    reverted++
  }

  console.log(`[cron/sp-post-cita-cleanup] reverted=${reverted} skipped=${skipped}`)
  return NextResponse.json({ reverted, skipped })
}
