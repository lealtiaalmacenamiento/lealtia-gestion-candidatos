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
  conferenceMode?: 'google' | 'none'
  location?: string | null
}

export interface RemoteMeetingResult {
  meetingUrl: string | null
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
  const conferenceMode = request.conferenceMode ?? 'google'

  const attempt = async (token: string): Promise<RemoteMeetingResult> => {
    const result = await googleMeetCreateEvent(token, {
      summary: request.summary,
      description: request.description,
      start: request.start,
      end: request.end,
      attendees: request.attendees,
      timezone,
      conferenceMode,
      location: request.location || undefined
    })
    if (conferenceMode === 'google' && !result.meetingUrl) {
      throw new Error('Google Meet no devolvió un enlace de reunión')
    }
    return { meetingUrl: result.meetingUrl || null, externalEventId: result.eventId, raw: result.raw }
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

interface GoogleFreeBusySlot {
  start?: string
  end?: string
}

interface GoogleFreeBusyCalendar {
  busy?: GoogleFreeBusySlot[]
}

interface GoogleFreeBusyResponse {
  calendars?: Record<string, GoogleFreeBusyCalendar>
}

function buildGoogleBusyRequest(timeMin: string, timeMax: string) {
  const timezone = process.env.AGENDA_TZ || 'America/Mexico_City'
  return {
    timeMin,
    timeMax,
    timeZone: timezone,
    items: [{ id: 'primary' }]
  }
}

async function ensureGoogleToken(usuarioAuthId: string): Promise<{ accessToken: string; token: StoredIntegrationToken } | null> {
  const { token, error } = await getIntegrationToken(usuarioAuthId, 'google')
  if (error) throw new Error(error.message)
  if (!token) return null
  return ensureGoogleAccessToken(usuarioAuthId, token)
}

async function requestGoogleBusy(accessToken: string, body: unknown): Promise<Array<{ start: string; end: string }>> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  let payload: GoogleFreeBusyResponse | null = null
  try {
    payload = (await response.json()) as GoogleFreeBusyResponse | null
  } catch {
    payload = null
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GoogleMeetApiError(response.status, payload, 'Token inválido para Google Calendar')
    }
    const message = (payload as unknown as { error?: { message?: string } } | null)?.error?.message
    throw new Error(message || `Google Calendar devolvió ${response.status}`)
  }

  const busyEntries = payload?.calendars?.primary?.busy ?? []
  return busyEntries
    .filter((entry): entry is Required<GoogleFreeBusySlot> => typeof entry.start === 'string' && typeof entry.end === 'string')
    .map((entry) => ({ start: entry.start!, end: entry.end! }))
}

export async function fetchGoogleCalendarBusy(
  usuarioAuthId: string,
  timeMin: string,
  timeMax: string
): Promise<Array<{ start: string; end: string }>> {
  const ensured = await ensureGoogleToken(usuarioAuthId)
  if (!ensured) {
    return []
  }

  let currentToken = ensured.token
  const requestBody = buildGoogleBusyRequest(timeMin, timeMax)

  try {
    return await requestGoogleBusy(ensured.accessToken, requestBody)
  } catch (err) {
    const apiErr = err instanceof GoogleMeetApiError ? err : null
    if (apiErr && (apiErr.status === 401 || apiErr.status === 403)) {
      const refreshed = await ensureGoogleAccessToken(usuarioAuthId, currentToken)
      currentToken = refreshed.token
      return await requestGoogleBusy(refreshed.accessToken, requestBody)
    }
    throw err instanceof Error ? err : new Error(String(err))
  }
}
