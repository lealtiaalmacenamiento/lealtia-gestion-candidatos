import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getCampaigns } from '@/lib/integrations/sendpilot'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const supabase = ensureAdminClient()

/**
 * POST /api/sp/campanas/sync
 * Fetches all campaigns from SendPilot and upserts them into sp_campanas.
 * Only imports campaigns not already present (matched by sendpilot_campaign_id).
 * Returns { inserted, total }.
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
    return NextResponse.json({ inserted: 0, total: 0 })
  }

  // Get existing sendpilot_campaign_ids to avoid duplicates
  const { data: existing } = await supabase
    .from('sp_campanas')
    .select('sendpilot_campaign_id')

  const existingIds = new Set((existing ?? []).map(r => r.sendpilot_campaign_id))

  const toInsert = spCampaigns
    .filter(c => !existingIds.has(c.id))
    .map(c => ({
      nombre: c.name,
      sendpilot_campaign_id: c.id,
      estado: ['active', 'started'].includes(c.status) ? 'activa'
            : c.status === 'paused' ? 'pausada'
            : c.status === 'completed' ? 'terminada'
            : 'pausada', // draft y cualquier otro → pausada
    }))

  let inserted = 0
  if (toInsert.length > 0) {
    const { error } = await supabase.from('sp_campanas').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = toInsert.length
  }

  await logAccion('sp_campanas_sync', {
    usuario: actor.email,
    tabla_afectada: 'sp_campanas',
    snapshot: { inserted, total: spCampaigns.length }
  }).catch(() => {})

  return NextResponse.json({ inserted, total: spCampaigns.length })
}
