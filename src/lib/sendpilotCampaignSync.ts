import { getCampaigns, getConversations, normalizeLinkedInSlug } from '@/lib/integrations/sendpilot'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { syncLeadsForCampaign } from '@/lib/sp-leads-sync'

export interface SendPilotCampaignSyncResult {
  inserted: number
  updated: number
  removed: number
  total: number
  leadsInserted: number
  leadsUpdated: number
  sendersDetected: number
}

function mapEstado(status: string): string {
  if (['active', 'started'].includes(status)) return 'activa'
  if (status === 'paused') return 'pausada'
  if (status === 'completed') return 'terminada'
  return 'pausada'
}

export async function syncSendPilotCampaignsAndLeads(
  supabase = ensureAdminClient()
): Promise<SendPilotCampaignSyncResult> {
  const spCampaigns = await getCampaigns()

  if (!spCampaigns.length) {
    return { inserted: 0, updated: 0, removed: 0, total: 0, leadsInserted: 0, leadsUpdated: 0, sendersDetected: 0 }
  }

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
    if (error) throw new Error(error.message)
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

  const removedRows = (existing ?? []).filter(r => !spIdSet.has(r.sendpilot_campaign_id))
  if (removedRows.length > 0) {
    await supabase
      .from('sp_campanas')
      .update({ existe_en_sp: false, updated_at: new Date().toISOString() })
      .in('id', removedRows.map(r => r.id))
    removed = removedRows.length
  }

  const { data: allRows } = await supabase
    .from('sp_campanas')
    .select('id, sendpilot_campaign_id')
    .in('sendpilot_campaign_id', spCampaigns.map(c => c.id))

  const rowBySp = new Map((allRows ?? []).map(r => [r.sendpilot_campaign_id, r.id]))

  let leadsInserted = 0
  let leadsUpdated = 0
  for (const c of spCampaigns) {
    const campanaId = rowBySp.get(c.id)
    if (!campanaId) continue
    const result = await syncLeadsForCampaign(campanaId, c.id)
    if (result.error) throw new Error(`Error al obtener leads de SendPilot: ${result.error}`)
    leadsInserted += result.inserted
    leadsUpdated += result.updated
  }

  let sendersDetected = 0
  try {
    const firstPage = await getConversations(undefined, 1, 50)
    const allConvs = [...firstPage.conversations]
    let hasMore = firstPage.pagination.hasMore
    for (let page = 2; page <= 10 && hasMore; page++) {
      const nextPage = await getConversations(undefined, page, 50)
      allConvs.push(...nextPage.conversations)
      hasMore = nextPage.pagination.hasMore
    }

    const { data: precandidatos } = await supabase
      .from('sp_precandidatos')
      .select('linkedin_slug, campana_id')
      .not('linkedin_slug', 'is', null)
      .not('campana_id', 'is', null)

    const slugToCampanaId = new Map<string, string>(
      (precandidatos ?? []).map(r => [r.linkedin_slug as string, r.campana_id as string])
    )

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

    for (const [campanaId, senderSet] of campanaSenders) {
      await supabase
        .from('sp_campanas')
        .update({ sp_sender_ids: Array.from(senderSet), updated_at: new Date().toISOString() })
        .eq('id', campanaId)
      sendersDetected++
    }

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
    console.warn('[sendpilotCampaignSync] sender detection failed:', err instanceof Error ? err.message : String(err))
  }

  return { inserted, updated, removed, total: spCampaigns.length, leadsInserted, leadsUpdated, sendersDetected }
}
