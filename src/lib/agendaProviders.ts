import { getIntegrationToken, upsertIntegrationToken, type StoredIntegrationToken, type IntegrationProvider } from './integrationTokens'
import { googleMeetCreateEvent, googleMeetCancelEvent, googleMeetRefreshAccessToken, GoogleMeetApiError } from './googleMeet'
import type { MeetingProvider } from '@/types'

const EXPIRY_DRIFT_MS = 2 * 60 * 1000 // 2 minutes tolerance

export interface RemoteMeetingRequest {
  usuarioAuthId: string
  provider: MeetingProvider
  start: string
  end: string
  summary: string
  description?: string | null
  attendees?: string[]
  timezone?: string | null
}

export interface RemoteMeetingResult {
  meetingUrl: string
  externalEventId: string
  raw: unknown
}

function mapProvider(provider: MeetingProvider): IntegrationProvider {
  switch (provider) {
    case 'google_meet':
      return 'google'
    case 'zoom':
      return 'zoom'
    default:
      throw new Error(`Proveedor de meeting no soportado: ${provider}`)
  }
}

function isTokenValid(expiresAt?: string | null): boolean {
  if (!expiresAt) return false
  const expires = new Date(expiresAt).getTime()
  if (!Number.isFinite(expires)) return false
  return expires - EXPIRY_DRIFT_MS > Date.now()
}

async function ensureGoogleAccessToken(usuarioAuthId: string, token: StoredIntegrationToken): Promise<{ accessToken: string; token: StoredIntegrationToken }> {
  if (token.accessToken && isTokenValid(token.expiresAt)) {
    return { accessToken: token.accessToken, token }
  }
  if (!token.refreshToken) {
    throw new Error('El token de integración Google no tiene refresh_token disponible')
  }
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Variables GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configuradas')
  }
  const refreshed = await googleMeetRefreshAccessToken(token.refreshToken, clientId, clientSecret)
  const expiresAt = refreshed.expiresIn > 0 ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString() : null
  const newToken: StoredIntegrationToken = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || token.refreshToken,
    expiresAt,
    scopes: refreshed.scope ? refreshed.scope.split(' ') : token.scopes || null
  }
  const { error: upsertError } = await upsertIntegrationToken(usuarioAuthId, 'google', newToken)
  if (upsertError) throw new Error(upsertError.message)
  return { accessToken: newToken.accessToken, token: newToken }
}

async function getAccessToken(usuarioAuthId: string, provider: MeetingProvider): Promise<{ accessToken: string; token: StoredIntegrationToken }> {
  const integrationProvider = mapProvider(provider)
  const { token, error } = await getIntegrationToken(usuarioAuthId, integrationProvider)
  if (error) throw new Error(error.message)
  if (!token) throw new Error('No existe integración configurada para el usuario seleccionado')
  if (integrationProvider === 'google') {
    return ensureGoogleAccessToken(usuarioAuthId, token)
  }
  throw new Error(`Automatización para ${provider} no implementada`)
}

export async function createRemoteMeeting(request: RemoteMeetingRequest): Promise<RemoteMeetingResult> {
  const { accessToken } = await getAccessToken(request.usuarioAuthId, request.provider)
  const timezone = request.timezone || process.env.AGENDA_TZ || 'America/Mexico_City'

  const attempt = async (token: string): Promise<RemoteMeetingResult> => {
    const result = await googleMeetCreateEvent(token, {
      summary: request.summary,
      description: request.description,
      start: request.start,
      end: request.end,
      attendees: request.attendees,
      timezone
    })
    if (!result.meetingUrl) {
      throw new Error('Google Meet no devolvió un enlace de reunión')
    }
    return { meetingUrl: result.meetingUrl, externalEventId: result.eventId, raw: result.raw }
  }

  try {
    return await attempt(accessToken)
  } catch (err) {
    const apiErr = err instanceof GoogleMeetApiError ? err : null
    if (apiErr && (apiErr.status === 401 || apiErr.status === 403)) {
      const refreshed = await getAccessToken(request.usuarioAuthId, request.provider)
      return await attempt(refreshed.accessToken)
    }
    throw err instanceof Error ? err : new Error(String(err))
  }
}

export async function cancelRemoteMeeting(usuarioAuthId: string, provider: MeetingProvider, externalEventId: string): Promise<void> {
  const { accessToken } = await getAccessToken(usuarioAuthId, provider)

  const attempt = async (token: string) => {
    await googleMeetCancelEvent(token, externalEventId)
  }

  try {
    await attempt(accessToken)
  } catch (err) {
    const apiErr = err instanceof GoogleMeetApiError ? err : null
    if (apiErr) {
      if (apiErr.status === 404) {
        return
      }
      if (apiErr.status === 401 || apiErr.status === 403) {
        const refreshed = await getAccessToken(usuarioAuthId, provider)
        await attempt(refreshed.accessToken)
        return
      }
    }
    throw err instanceof Error ? err : new Error(String(err))
  }
}
