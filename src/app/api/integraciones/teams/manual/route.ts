import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { saveTeamsManualSettings } from '@/lib/zoomManual'

interface TeamsManualPayload {
  meetingUrl?: string
  meetingId?: string | null
  meetingPassword?: string | null
}

export async function POST(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!actor.id_auth) {
    return NextResponse.json({ error: 'Usuario sin id_auth configurado' }, { status: 400 })
  }

  let payload: TeamsManualPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const meetingUrl = typeof payload.meetingUrl === 'string' ? payload.meetingUrl.trim() : ''
  const meetingId = typeof payload.meetingId === 'string' ? payload.meetingId.trim() : ''
  const meetingPassword = typeof payload.meetingPassword === 'string' ? payload.meetingPassword.trim() : ''

  if (!meetingUrl) {
    return NextResponse.json({ error: 'meetingUrl es obligatorio' }, { status: 400 })
  }
  if (!/^https?:\/\//i.test(meetingUrl)) {
    return NextResponse.json({ error: 'meetingUrl debe iniciar con http(s)://' }, { status: 400 })
  }

  const { error } = await saveTeamsManualSettings(actor.id_auth, {
    meetingUrl,
    meetingId: meetingId || null,
    meetingPassword: meetingPassword || null
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    await logAccion('teams_manual_actualizado', {
      usuario: actor.email,
      tabla_afectada: 'tokens_integracion',
      snapshot: {
        proveedor: 'teams',
        meetingUrl,
        meetingId: meetingId || null,
        meetingPassword: meetingPassword ? '***' : null
      }
    })
  } catch {}

  return NextResponse.json({
    ok: true,
    settings: {
      meetingUrl,
      meetingId: meetingId || null,
      meetingPassword: meetingPassword || null
    }
  })
}
