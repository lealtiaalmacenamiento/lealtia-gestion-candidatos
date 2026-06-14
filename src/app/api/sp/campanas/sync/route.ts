import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getCampaigns, getConversations, normalizeLinkedInSlug } from '@/lib/integrations/sendpilot'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'
import { syncLeadsForCampaign } from '@/lib/sp-leads-sync'

export const dynamic = 'force-dynamic'

const supabase = ensureAdminClient()

/**
 * POST /api/sp/campanas/sync
 * Fetches all campaigns from SendPilot and upserts them into sp_campanas.
 * - Inserts new campaigns
 * - Updates nombre/estado of existing ones
 * - Marks campaigns no longer in SP as existe_en_sp=false
 * - Syncs leads for all active SP campaigns
 * Returns { inserted, updated, removed, total, leadsInserted, leadsUpdated }.
 */
export async function POST() {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let spCampaigns
  try {
    spCampaigns = await getCampaigns()
  } catch (err) {
    return NextResponse.json(
      { error: `Error al obtener campañas de SendPilot: ${err instanceof Error ? err.message : 'error desconocido'}` },
      { status: 502 }
    )
  }

  if (!spCampaigns.length) {
    return NextResponse.json({ inserted: 0, updated: 0, removed: 0, total: 0, leadsInserted: 0, leadsUpdated: 0 })
  }

  function mapEstado(status: string): string {
    if (['active', 'started'].includes(status)) return 'activa'
    if (status === 'paused') return 'pausada'
    if (status === 'completed') return 'terminada'
    return 'pausada' // draft y cualquier otro → pausada
  }

  // Load existing records for upsert logic
  const { data: existing } = await supabase
    .from('sp_campanas')
    .select('id, sendpilot_campaign_id, nombre, estado')

  const existingMap = new Map((existing ?? []).map(r => [r.sendpilot_campaign_id, r]))
  const spIdSet = new Set(spCampaigns.map(c => c.id))

  const toInsert = spCampaigns
    .filter(c => !existingMap.has(c.id))
    .map(c => ({
      nombre: c.name,
      sendpilot_campaign_id: c.id,
      estado: mapEstado(c.status),
      existe_en_sp: true,
      sp_sender_ids: c.linkedInSenderIds ?? [],
      sp_analytics: {
        totalLeads: c.totalLeads ?? 0,
        connectionsSent: c.connectionsSent ?? 0,
        messagesSent: c.messagesSent ?? 0,
        repliesReceived: c.repliesReceived ?? 0,
      },
    }))

  // Update existing campaigns that changed name, status, or existe_en_sp flag
  const toUpdate = spCampaigns
    .filter(c => {
      const row = existingMap.get(c.id)
      if (!row) return false
      return row.nombre !== c.name || row.estado !== mapEstado(c.status)
    })

  let inserted = 0
  let updated = 0
  let removed = 0

  if (toInsert.length > 0) {
    const { error } = await supabase.from('sp_campanas').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = toInsert.length
  }

  for (const c of toUpdate) {
    const row = existingMap.get(c.id)!
    await supabase
      .from('sp_campanas')
      .update({
        nombre: c.name,
        estado: mapEstado(c.status),
        existe_en_sp: true,
        sp_analytics: {
          totalLeads: c.totalLeads ?? 0,
          connectionsSent: c.connectionsSent ?? 0,
          messagesSent: c.messagesSent ?? 0,
          repliesReceived: c.repliesReceived ?? 0,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    updated++
  }

  // Re-mark all SP campaigns as existing (covers ones that were previously marked removed)
  // Also refresh analytics even if name/estado didn't change
  const unchangedSpCampaigns = spCampaigns
    .filter(c => existingMap.has(c.id) && !toUpdate.some(u => u.id === c.id))
  for (const c of unchangedSpCampaigns) {
    const row = existingMap.get(c.id)!
    await supabase.from('sp_campanas').update({
      existe_en_sp: true,
      sp_analytics: {
        totalLeads: c.totalLeads ?? 0,
        connectionsSent: c.connectionsSent ?? 0,
        messagesSent: c.messagesSent ?? 0,
        repliesReceived: c.repliesReceived ?? 0,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
  }

  // Mark campaigns no longer in SP
  const removedRows = (existing ?? []).filter(r => !spIdSet.has(r.sendpilot_campaign_id))
  if (removedRows.length > 0) {
    await supabase
      .from('sp_campanas')
      .update({ existe_en_sp: false, updated_at: new Date().toISOString() })
      .in('id', removedRows.map(r => r.id))
    removed = removedRows.length
  }

  // Re-read inserted rows so we have their UUIDs for lead sync
  const { data: allRows } = await supabase
    .from('sp_campanas')
    .select('id, sendpilot_campaign_id')
    .in('sendpilot_campaign_id', spCampaigns.map(c => c.id))

  const rowBySp = new Map((allRows ?? []).map(r => [r.sendpilot_campaign_id, r.id]))

  // Sync leads for all SP campaigns
  let leadsInserted = 0
  let leadsUpdated = 0
  for (const c of spCampaigns) {
    const campanaId = rowBySp.get(c.id)
    if (!campanaId) continue
    const result = await syncLeadsForCampaign(campanaId, c.id)
    leadsInserted += result.inserted
    leadsUpdated += result.updated
  }

  // --- Auto-detect sp_sender_ids from inbox conversations ---
  let sendersDetected = 0
  try {
    // Fetch inbox pages (conversations are independent of getSenders — don't couple them)
    const firstPage = await getConversations(undefined, 1, 50)
    const allConvs = [...firstPage.conversations]
    let hasMore = firstPage.pagination.hasMore
    for (let page = 2; page <= 10 && hasMore; page++) {
      const nextPage = await getConversations(undefined, page, 50)
      allConvs.push(...nextPage.conversations)
      hasMore = nextPage.pagination.hasMore
    }

    // Build slug → campana_id lookup from leads already in DB
    const { data: precandidatos } = await supabase
      .from('sp_precandidatos')
      .select('linkedin_slug, campana_id')
      .not('linkedin_slug', 'is', null)
      .not('campana_id', 'is', null)

    const slugToCampanaId = new Map<string, string>(
      (precandidatos ?? []).map(r => [r.linkedin_slug as string, r.campana_id as string])
    )

    // Map campana_id → Set<accountId> by matching conversation participants to leads
    const campanaSenders = new Map<string, Set<string>>()
    const allAccountIds = new Set<string>()
    for (const conv of allConvs) {
      if (!conv.accountId) continue
      allAccountIds.add(conv.accountId)
      const profileUrl = conv.participants?.[0]?.profileUrl
      if (!profileUrl) continue
      const slug = normalizeLinkedInSlug(profileUrl)
      if (!slug) continue
      const campanaId = slugToCampanaId.get(slug)
      if (!campanaId) continue
      if (!campanaSenders.has(campanaId)) campanaSenders.set(campanaId, new Set())
      campanaSenders.get(campanaId)!.add(conv.accountId)
    }

    // Write detected senders per campaign
    for (const [campanaId, senderSet] of campanaSenders) {
      await supabase
        .from('sp_campanas')
        .update({ sp_sender_ids: Array.from(senderSet), updated_at: new Date().toISOString() })
        .eq('id', campanaId)
      sendersDetected++
    }

    // Fallback: if only 1 unique accountId across all conversations, assign it to unmatched campaigns.
    // This avoids depending on the /senders endpoint (which SP may not expose).
    if (allAccountIds.size === 1) {
      const [singleId] = allAccountIds
      const detectedIds = new Set(campanaSenders.keys())
      const withoutSenders = (allRows ?? []).filter(r => !detectedIds.has(r.id)).map(r => r.id)
      if (withoutSenders.length > 0) {
        await supabase
          .from('sp_campanas')
          .update({ sp_sender_ids: [singleId], updated_at: new Date().toISOString() })
          .in('id', withoutSenders)
        sendersDetected += withoutSenders.length
      }
    }
  } catch (err) {
    console.warn('[sp/campanas/sync] sender detection failed:', err instanceof Error ? err.message : String(err))
  }

  await logAccion('sp_campanas_sync', {
    usuario: actor.email,
    tabla_afectada: 'sp_campanas',
    snapshot: { inserted, updated, removed, total: spCampaigns.length, leadsInserted, leadsUpdated, sendersDetected }
  }).catch(() => {})

  return NextResponse.json({ inserted, updated, removed, total: spCampaigns.length, leadsInserted, leadsUpdated, sendersDetected })
}
