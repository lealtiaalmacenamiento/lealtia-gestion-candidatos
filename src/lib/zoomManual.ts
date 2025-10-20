import type { PostgrestError } from '@supabase/supabase-js'
import type { ManualMeetingProvider, ManualMeetingSettings } from '@/types'
import { getIntegrationToken, removeIntegrationToken, upsertIntegrationToken, type StoredIntegrationToken } from '@/lib/integrationTokens'

interface ManualMeetingResult {
  settings: ManualMeetingSettings | null
  legacy: boolean
  error: PostgrestError | null
}

const MANUAL_SCOPE_MAP: Record<ManualMeetingProvider, string> = {
  zoom: 'zoom_personal_link',
  teams: 'teams_manual_link'
}

function parseManualMeeting(provider: ManualMeetingProvider, token: StoredIntegrationToken | null): { settings: ManualMeetingSettings | null; legacy: boolean } {
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
      return { settings: null, legacy: provider === 'zoom' }
    }
    const parsedObj = parsed as Record<string, unknown>
    const meetingUrlValue = parsedObj.meetingUrl
    const meetingIdValue = parsedObj.meetingId
    const meetingPasswordValue = parsedObj.meetingPassword

    const meetingUrl = typeof meetingUrlValue === 'string' ? meetingUrlValue.trim() : ''
    const meetingId = typeof meetingIdValue === 'string' ? meetingIdValue.trim() : null
    const meetingPassword = typeof meetingPasswordValue === 'string' ? meetingPasswordValue.trim() : null

    if (!meetingUrl) {
      return { settings: null, legacy: provider === 'zoom' }
    }

    const settings: ManualMeetingSettings = {
      meetingUrl,
      meetingId: meetingId || null,
      meetingPassword: meetingPassword || null
    }

    return {
      settings,
      legacy: provider === 'zoom' ? !(token.scopes || []).includes(MANUAL_SCOPE_MAP[provider]) : false
    }
  } catch {
    return { settings: null, legacy: provider === 'zoom' }
  }
}

async function getManualMeetingSettingsInternal(usuarioAuthId: string, provider: ManualMeetingProvider): Promise<ManualMeetingResult> {
  const { token, error } = await getIntegrationToken(usuarioAuthId, provider)
  if (error) {
    return { settings: null, legacy: false, error }
  }
  const { settings, legacy } = parseManualMeeting(provider, token)
  return { settings, legacy, error: null }
}

async function saveManualMeetingSettingsInternal(usuarioAuthId: string, provider: ManualMeetingProvider, settings: ManualMeetingSettings): Promise<{ error: PostgrestError | null }> {
  const payload: ManualMeetingSettings = {
    meetingUrl: settings.meetingUrl.trim(),
    meetingId: settings.meetingId?.trim() || null,
    meetingPassword: settings.meetingPassword?.trim() || null
  }

  return upsertIntegrationToken(usuarioAuthId, provider, {
    accessToken: JSON.stringify(payload),
    refreshToken: null,
    expiresAt: null,
    scopes: [MANUAL_SCOPE_MAP[provider]]
  })
}

async function clearManualMeetingSettingsInternal(usuarioAuthId: string, provider: ManualMeetingProvider): Promise<{ error: PostgrestError | null }> {
  return removeIntegrationToken(usuarioAuthId, provider)
}

export async function getZoomManualSettings(usuarioAuthId: string) {
  return getManualMeetingSettingsInternal(usuarioAuthId, 'zoom')
}

export async function saveZoomManualSettings(usuarioAuthId: string, settings: ManualMeetingSettings) {
  return saveManualMeetingSettingsInternal(usuarioAuthId, 'zoom', settings)
}

export async function clearZoomManualSettings(usuarioAuthId: string) {
  return clearManualMeetingSettingsInternal(usuarioAuthId, 'zoom')
}

export async function getTeamsManualSettings(usuarioAuthId: string) {
  return getManualMeetingSettingsInternal(usuarioAuthId, 'teams')
}

export async function saveTeamsManualSettings(usuarioAuthId: string, settings: ManualMeetingSettings) {
  return saveManualMeetingSettingsInternal(usuarioAuthId, 'teams', settings)
}

export async function clearTeamsManualSettings(usuarioAuthId: string) {
  return clearManualMeetingSettingsInternal(usuarioAuthId, 'teams')
}
