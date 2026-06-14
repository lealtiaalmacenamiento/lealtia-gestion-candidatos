import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { addLead } from '@/lib/integrations/sendpilot'
import type { SPLeadInput } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sendpilot/leads
 * Adds a lead to a SendPilot campaign. Admin/supervisor only.
 * Body: { campaignId: string, linkedinUrl: string, firstName?, lastName?, company?, title? }
 */
export async function POST(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let body: { campaignId?: string } & SPLeadInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.campaignId) return NextResponse.json({ error: 'campaignId es obligatorio' }, { status: 400 })
  if (!body.linkedinUrl) return NextResponse.json({ error: 'linkedinUrl es obligatorio' }, { status: 400 })

  try {
    const lead = await addLead(body.campaignId, {
      linkedinUrl: body.linkedinUrl,
      firstName: body.firstName,
      lastName: body.lastName,
      company: body.company,
      title: body.title
    })
    return NextResponse.json(lead, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error SP' }, { status: 502 })
  }
}
