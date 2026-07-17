import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { getCalcomApiKey, getCalcomSlots } from '@/lib/integrations/calcom'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const actor = await getUsuarioSesion(req.headers)
  if (!actor?.activo) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = Number(req.nextUrl.searchParams.get('usuario_id'))
  const eventTypeId = Number(req.nextUrl.searchParams.get('event_type_id'))
  const start = req.nextUrl.searchParams.get('start')
  const end = req.nextUrl.searchParams.get('end')
  const timeZone = req.nextUrl.searchParams.get('timeZone') || 'America/Mexico_City'
  if (!Number.isFinite(userId) || !Number.isFinite(eventTypeId) || !start || !end) {
    return NextResponse.json({ error: 'Faltan agente, evento o rango de fechas' }, { status: 400 })
  }
  if (userId !== actor.id && actor.rol !== 'admin' && actor.rol !== 'supervisor') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const supabase = ensureAdminClient()
  const { data: user } = await supabase.from('usuarios').select('id_auth').eq('id', userId).maybeSingle()
  if (!user?.id_auth) return NextResponse.json({ error: 'Usuario sin acceso configurado' }, { status: 409 })
  const apiKey = await getCalcomApiKey(user.id_auth)
  if (!apiKey) return NextResponse.json({ error: 'Cal.com no conectado' }, { status: 409 })
  try {
    const slots = await getCalcomSlots(apiKey, { eventTypeId, start, end, timeZone })
    return NextResponse.json({ slots })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo consultar Cal.com' }, { status: 502 })
  }
}
