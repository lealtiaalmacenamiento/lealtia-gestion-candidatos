import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getLeads } from '@/lib/integrations/sendpilot'
import { parseSpLinkedinUrl } from '@/lib/integrations/sendpilot'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const supabase = ensureAdminClient()

/**
 * POST /api/sp/campanas/[id]/sync-leads
 * Fetches all leads from SendPilot for this campaign (paginated) and upserts
 * them into sp_precandidatos. Existing records (matched by sp_contact_id) are
 * updated; new ones are inserted. Returns { inserted, updated, total }.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id: campanaId } = await params

  // Verify the campaign exists and get its sendpilot_campaign_id
  const { data: campana, error: campanaError } = await supabase
    .from('sp_campanas')
    .select('id, sendpilot_campaign_id')
    .eq('id', campanaId)
    .single()

  if (campanaError || !campana) {
    return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
  }

  // Fetch all pages from SendPilot
  let allLeads: Awaited<ReturnType<typeof getLeads>>['leads'] = []
  try {
    const first = await getLeads(campana.sendpilot_campaign_id, 1)
    allLeads = [...first.leads]
    for (let page = 2; page <= first.totalPages; page++) {
      const { leads } = await getLeads(campana.sendpilot_campaign_id, page)
      allLeads = [...allLeads, ...leads]
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Error al obtener leads de SendPilot: ${err instanceof Error ? err.message : 'error desconocido'}` },
      { status: 502 }
    )
  }

  if (!allLeads.length) {
    return NextResponse.json({ inserted: 0, updated: 0, total: 0 })
  }

// Map SP's customLeadStatus + status to our estado.
// Never downgrades records already at 'promovido' or 'cita_agendada'.
const PROTECTED_ESTADOS = new Set(['promovido', 'cita_agendada'])

function mapSpEstado(customLeadStatus: string | undefined, spStatus: string): string {
  const cls = (customLeadStatus ?? '').toLowerCase()
  if (cls === 'meeting booked')     return 'link_enviado'
  if (cls === 'meeting completed')  return 'cita_agendada'
  if (cls === 'interested' || cls === 'opportunity') return 'respondio'
  if (cls === 'not interested' || cls === 'wrong person' || cls === 'closed') return 'descartado'
  // SP status "replied" / "replied" style activity not available in list endpoint
  void spStatus // reserved for future use
  return 'en_secuencia'
}

  const { data: existingRows } = await supabase
    .from('sp_precandidatos')
    .select('id, sp_contact_id, estado')
    .eq('campana_id', campanaId)

  const existingMap = new Map((existingRows ?? []).map(r => [r.sp_contact_id, { id: r.id, estado: r.estado }]))

  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; data: Record<string, unknown> }[] = []

  for (const lead of allLeads) {
    const { linkedin_url, linkedin_urn, linkedin_slug } = parseSpLinkedinUrl(lead.linkedinUrl)
    const nombre = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() || 'Sin nombre'
    const cargo = (lead as unknown as Record<string, unknown>).title as string | undefined
    const nuevoEstado = mapSpEstado((lead as unknown as Record<string, unknown>).customLeadStatus as string, lead.status)

    const contactInfo: Record<string, unknown> = {
      nombre,
      linkedin_url,
      linkedin_urn,
      linkedin_slug,
      updated_at: new Date().toISOString(),
      ...(cargo ? { cargo } : {}),
    }

    const existingRecord = existingMap.get(lead.id)
    if (existingRecord) {
      const shouldUpdateEstado = !PROTECTED_ESTADOS.has(existingRecord.estado) && nuevoEstado !== existingRecord.estado
      toUpdate.push({
        id: existingRecord.id,
        data: { ...contactInfo, ...(shouldUpdateEstado ? { estado: nuevoEstado } : {}) }
      })
    } else {
      toInsert.push({ campana_id: campanaId, sp_contact_id: lead.id, ...contactInfo, estado: nuevoEstado })
    }
  }

  let inserted = 0
  let updated = 0

  if (toInsert.length > 0) {
    const { error } = await supabase.from('sp_precandidatos').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = toInsert.length
  }

  for (const { id, data } of toUpdate) {
    await supabase.from('sp_precandidatos').update(data).eq('id', id)
    updated++
  }

  await logAccion('sp_leads_sync', {
    usuario: actor.email,
    tabla_afectada: 'sp_precandidatos',
    snapshot: { campanaId, inserted, updated, total: allLeads.length }
  }).catch(() => {})

  return NextResponse.json({ inserted, updated, total: allLeads.length })
}
