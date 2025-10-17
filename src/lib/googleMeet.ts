import { randomUUID } from 'node:crypto'

export class GoogleMeetApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, payload: unknown, message?: string) {
    super(message || `Google Meet API error (${status})`)
    this.status = status
    this.payload = payload
  }
}

export interface GoogleMeetEventInput {
  summary: string
  description?: string | null
  start: string
  end: string
  attendees?: string[]
  timezone?: string
}

export interface GoogleMeetEventResult {
  meetingUrl: string
  eventId: string
  raw: unknown
}

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

interface GoogleEventEntryPoint {
  entryPointType?: string
  uri?: string
}

interface GoogleEventConferenceData {
  entryPoints?: GoogleEventEntryPoint[]
}

interface GoogleEventPayload {
  id?: string
  hangoutLink?: string
  conferenceData?: GoogleEventConferenceData
}

interface GoogleErrorPayload {
  error?: { message?: string }
}

function buildAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
}

function extractMeetingUrl(data: GoogleEventPayload | null): string {
  if (!data) return ''
  if (typeof data.hangoutLink === 'string' && data.hangoutLink.length > 0) return data.hangoutLink
  const entry = data.conferenceData?.entryPoints?.find(ep => ep?.entryPointType === 'video' && typeof ep.uri === 'string' && ep.uri.length > 0)
  if (entry?.uri) return entry.uri
  return ''
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const candidate = payload as GoogleErrorPayload
  return candidate.error?.message
}

export async function googleMeetCreateEvent(accessToken: string, input: GoogleMeetEventInput): Promise<GoogleMeetEventResult> {
  const requestId = typeof randomUUID === 'function' ? randomUUID() : Math.random().toString(36).slice(2)
  const body = {
    summary: input.summary,
    description: input.description || undefined,
    start: { dateTime: input.start, timeZone: input.timezone },
    end: { dateTime: input.end, timeZone: input.timezone },
    attendees: (input.attendees || []).map(email => ({ email })),
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  }

  const url = `${GOOGLE_CALENDAR_BASE}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`
  const response = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(accessToken),
    body: JSON.stringify(body)
  })

  const payload = (await response.json().catch(() => null)) as GoogleEventPayload | GoogleErrorPayload | null
  if (!response.ok) {
    throw new GoogleMeetApiError(response.status, payload, extractErrorMessage(payload))
  }

  return {
    meetingUrl: extractMeetingUrl(payload as GoogleEventPayload | null),
    eventId: (payload as GoogleEventPayload | null)?.id ?? '',
    raw: payload
  }
}

export async function googleMeetCancelEvent(accessToken: string, eventId: string): Promise<void> {
  const url = `${GOOGLE_CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok && response.status !== 204) {
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {}
    throw new GoogleMeetApiError(response.status, payload, extractErrorMessage(payload))
  }
}

export interface GoogleMeetRefreshResult {
  accessToken: string
  expiresIn: number
  refreshToken?: string
  scope?: string
}

export async function googleMeetRefreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<GoogleMeetRefreshResult> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  const payload = (await response.json().catch(() => null)) as GoogleErrorPayload | { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string } | null
  if (!response.ok) {
    throw new GoogleMeetApiError(response.status, payload, extractErrorMessage(payload))
  }

  return {
    accessToken: payload?.access_token ?? '',
    expiresIn: Number(payload?.expires_in ?? 0),
    refreshToken: payload?.refresh_token,
    scope: payload?.scope
  }
}
