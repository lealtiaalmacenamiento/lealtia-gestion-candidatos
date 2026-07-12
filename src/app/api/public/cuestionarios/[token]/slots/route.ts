import { NextRequest, NextResponse } from 'next/server'
import { resolvePublicQuestionnaireLink } from '@/lib/questionnairePublic'
import { getCalcomApiKey, getCalcomSlots } from '@/lib/integrations/calcom'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params
  const { link, error } = await resolvePublicQuestionnaireLink(token)
  if (error) return NextResponse.json({ error }, { status: 500 })
  if (!link?.cal_event_type_id || !link.agente.id_auth) {
    return NextResponse.json({ error: 'El agente no tiene un evento disponible' }, { status: 409 })
  }
  const start = req.nextUrl.searchParams.get('start')
  const end = req.nextUrl.searchParams.get('end')
  const timeZone = req.nextUrl.searchParams.get('timeZone') || 'America/Mexico_City'
  if (!start || !end) return NextResponse.json({ error: 'Selecciona un rango de fechas' }, { status: 400 })
  const apiKey = await getCalcomApiKey(link.agente.id_auth)
  if (!apiKey) return NextResponse.json({ error: 'La agenda del agente no está conectada' }, { status: 409 })
  try {
    const slots = await getCalcomSlots(apiKey, {
      eventTypeId: link.cal_event_type_id,
      start,
      end,
      timeZone
    })
    return NextResponse.json({ slots })
  } catch (slotError) {
    return NextResponse.json({ error: slotError instanceof Error ? slotError.message : 'No se pudo consultar la disponibilidad' }, { status: 502 })
  }
}
