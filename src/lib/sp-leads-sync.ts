import { getLeads, normalizeLinkedInSlug } from '@/lib/integrations/sendpilot'
import { ensureAdminClient } from '@/lib/supabaseAdmin'

const supabase = ensureAdminClient()

function mapEstado(spStatus: string): string {
  if (['connected', 'replied', 'meeting_booked'].includes(spStatus)) return 'respondio'
  return 'en_secuencia'
}

export async function syncLeadsForCampaign(
  campanaId: string,
  spCampaignId: string
): Promise<{ error?: string; inserted: number; updated: number }> {
  // Fetch all pages of leads from SendPilot
  let allLeads: Awaited<ReturnType<typeof getLeads>>['leads'] = []
  try {
    let page = 1
    let totalPages = 1
    do {
      const res = await getLeads(spCampaignId, page, 50)
      allLeads = allLeads.concat(res.leads)
      totalPages = res.totalPages
      page++
    } while (page <= totalPages)
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'error desconocido',
      inserted: 0,
      updated: 0,
    }
  }

  if (allLeads.length === 0) return { inserted: 0, updated: 0 }

  // Fetch existing contact IDs for this campaign to distinguish insert vs update
  const { data: existing } = await supabase
    .from('sp_precandidatos')
    .select('sp_contact_id')
    .eq('campana_id', campanaId)

  const existingIds = new Set((existing ?? []).map((r: { sp_contact_id: string }) => r.sp_contact_id))

  // Upsert all leads — idempotent thanks to UNIQUE(campana_id, sp_contact_id)
  const spIds = new Set(allLeads.map(l => l.id))
  const allRows = allLeads.map(l => ({
    campana_id: campanaId,
    sp_contact_id: l.id,
    nombre: [l.firstName, l.lastName].filter(Boolean).join(' ') || l.linkedinUrl,
    linkedin_url: l.linkedinUrl,
    linkedin_slug: normalizeLinkedInSlug(l.linkedinUrl),
    estado: mapEstado(l.status),
    existe_en_sp: true,
  }))

  const { error: upsertError, data: upserted } = await supabase
    .from('sp_precandidatos')
    .upsert(allRows, { onConflict: 'campana_id,sp_contact_id', ignoreDuplicates: false })
    .select('id, sp_contact_id')

  if (upsertError) return { error: upsertError.message, inserted: 0, updated: 0 }

  // Mark existe_en_sp = false for leads no longer in SP (preserves estado and history)
  const removedIds = [...existingIds].filter(id => !spIds.has(id))
  if (removedIds.length > 0) {
    await supabase
      .from('sp_precandidatos')
      .update({ existe_en_sp: false, updated_at: new Date().toISOString() })
      .eq('campana_id', campanaId)
      .in('sp_contact_id', removedIds)
  }

  // Approximate inserted vs updated based on existing ids
  const newIds = new Set((upserted ?? []).map((r: { sp_contact_id: string }) => r.sp_contact_id))
  const inserted = [...newIds].filter(id => !existingIds.has(id)).length
  const updateCount = allLeads.length - inserted

  return { inserted, updated: updateCount }
}
