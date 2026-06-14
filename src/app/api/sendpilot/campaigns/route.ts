import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getCampaigns } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

export async function GET() {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const campaigns = await getCampaigns()
    return NextResponse.json({ campaigns })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error SP' }, { status: 502 })
  }
}
