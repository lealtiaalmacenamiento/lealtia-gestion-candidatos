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
  const MAX_PAGES = 50  // cap at 2500 leads per sync; avoids runaway API quota usage
  try {
    let page = 1
    let totalPages = 1
    do {
      const res = await getLeads(spCampaignId, page, 50)
      allLeads = allLeads.concat(res.leads)
      totalPages = res.totalPages
      page++
      if (page > MAX_PAGES) {
        console.warn(`[sp-leads-sync] Reached ${MAX_PAGES} page limit for campaign ${spCampaignId}, stopping early`)
        break
      }
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

  const spIds = new Set(allLeads.map(l => l.id))

  // Split into new vs existing leads.
  // IMPORTANT: for existing records, do NOT overwrite 'estado' — the CRM owns
  // the estado lifecycle. SP may report a lead as 'en_secuencia' even after the
  // CRM has advanced it to 'respondio', 'link_enviado', etc.
  const newLeads = allLeads.filter(l => !existingIds.has(l.id))
  const existingLeads = allLeads.filter(l => existingIds.has(l.id))

  let inserted = 0
  let updateCount = 0

  // Insert new leads with SP-derived estado as starting point
  if (newLeads.length > 0) {
    const toInsert = newLeads.map(l => ({
      campana_id: campanaId,
      sp_contact_id: l.id,
      nombre: [l.firstName, l.lastName].filter(Boolean).join(' ') || l.linkedinUrl,
      linkedin_url: l.linkedinUrl,
      linkedin_slug: normalizeLinkedInSlug(l.linkedinUrl),
      estado: mapEstado(l.status),
      existe_en_sp: true,
    }))
    const { error: insertError } = await supabase
      .from('sp_precandidatos')
      .upsert(toInsert, {
        onConflict: 'campana_id,sp_contact_id',
        ignoreDuplicates: true,   // preserve CRM-owned estado if already exists
      })
    if (insertError) return { error: insertError.message, inserted: 0, updated: 0 }
    inserted = newLeads.length
  }

  // Update existing leads — refresh metadata but preserve CRM-owned 'estado'
  if (existingLeads.length > 0) {
    for (const l of existingLeads) {
      await supabase
        .from('sp_precandidatos')
        .update({
          nombre: [l.firstName, l.lastName].filter(Boolean).join(' ') || l.linkedinUrl,
          linkedin_url: l.linkedinUrl,
          linkedin_slug: normalizeLinkedInSlug(l.linkedinUrl),
          existe_en_sp: true,
          updated_at: new Date().toISOString(),
        })
        .eq('campana_id', campanaId)
        .eq('sp_contact_id', l.id)
    }
    updateCount = existingLeads.length
  }

  // Mark existe_en_sp = false for leads no longer in SP (preserves estado and history)
  const removedIds = [...existingIds].filter(id => !spIds.has(id))
  if (removedIds.length > 0) {
    await supabase
      .from('sp_precandidatos')
      .update({ existe_en_sp: false, updated_at: new Date().toISOString() })
      .eq('campana_id', campanaId)
      .in('sp_contact_id', removedIds)
  }

  return { inserted, updated: updateCount }
}
