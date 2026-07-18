import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { syncSendPilotCampaignsAndLeads } from '@/lib/sendpilotCampaignSync'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sp/campanas/sync
 * Sincroniza campañas, analíticas, leads y remitentes detectados desde SendPilot.
 */
export async function POST() {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const result = await syncSendPilotCampaignsAndLeads()

    await logAccion('sp_campanas_sync', {
      usuario: actor.email,
      tabla_afectada: 'sp_campanas',
      snapshot: result
    }).catch(() => {})

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: `Error al sincronizar SendPilot: ${err instanceof Error ? err.message : 'error desconocido'}` },
      { status: 502 }
    )
  }
}
