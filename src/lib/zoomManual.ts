import type { PostgrestError } from '@supabase/supabase-js'
import type { ZoomManualSettings } from '@/types'
import { getIntegrationToken, removeIntegrationToken, upsertIntegrationToken, type StoredIntegrationToken } from '@/lib/integrationTokens'

interface ZoomManualResult {
  settings: ZoomManualSettings | null
  legacy: boolean
  error: PostgrestError | null
}

const MANUAL_SCOPE = 'zoom_personal_link'

function parseZoomManual(token: StoredIntegrationToken | null): { settings: ZoomManualSettings | null; legacy: boolean } {
  if (!token?.accessToken) {
    return { settings: null, legacy: false }
  }

  const raw = token.accessToken.trim()
  if (!raw) {
    return { settings: null, legacy: false }
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return { settings: null, legacy: true }
    }
    const meetingUrl = typeof (parsed as { meetingUrl?: unknown }).meetingUrl === 'string'
      ? (parsed as { meetingUrl?: unknown }).meetingUrl.trim()
      : ''
    const meetingId = typeof (parsed as { meetingId?: unknown }).meetingId === 'string'
      ? (parsed as { meetingId?: unknown }).meetingId.trim()
      : null
    const meetingPassword = typeof (parsed as { meetingPassword?: unknown }).meetingPassword === 'string'
      ? (parsed as { meetingPassword?: unknown }).meetingPassword.trim()
      : null

    if (!meetingUrl) {
      return { settings: null, legacy: true }
    }

    return {
      settings: {
        meetingUrl,
        meetingId: meetingId || null,
        meetingPassword: meetingPassword || null
      },
      legacy: !(token.scopes || []).includes(MANUAL_SCOPE)
    }
  } catch {
    return { settings: null, legacy: true }
  }
}

export async function getZoomManualSettings(usuarioAuthId: string): Promise<ZoomManualResult> {
  const { token, error } = await getIntegrationToken(usuarioAuthId, 'zoom')
  if (error) {
    return { settings: null, legacy: false, error }
  }
  const { settings, legacy } = parseZoomManual(token)
  return { settings, legacy, error: null }
}

export async function saveZoomManualSettings(usuarioAuthId: string, settings: ZoomManualSettings): Promise<{ error: PostgrestError | null }> {
  const payload: ZoomManualSettings = {
    meetingUrl: settings.meetingUrl.trim(),
    meetingId: settings.meetingId?.trim() || null,
    meetingPassword: settings.meetingPassword?.trim() || null
  }

  return upsertIntegrationToken(usuarioAuthId, 'zoom', {
    accessToken: JSON.stringify(payload),
    refreshToken: null,
    expiresAt: null,
    scopes: [MANUAL_SCOPE]
  })
}

export async function clearZoomManualSettings(usuarioAuthId: string): Promise<{ error: PostgrestError | null }> {
  return removeIntegrationToken(usuarioAuthId, 'zoom')
}
