import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { getIntegrationToken, upsertIntegrationToken } from '@/lib/integrationTokens'

const BASE_URL = 'https://api.cal.com/v2'

// ---------------------------------------------------------------------------
// Signature verification
// Header: x-cal-signature-256: {hmac-hex}
// Signed message: raw_body
// Algorithm: HMAC-SHA256 with webhook_secret
// ---------------------------------------------------------------------------

export function verifyCalcomSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string
): boolean {
  if (!signatureHeader || !webhookSecret) return false
  try {
    const expected = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex')
    // Cal.com may send hex or base64; try hex first, then base64
    try {
      const sigBuf = Buffer.from(signatureHeader, 'hex')
      const expBuf = Buffer.from(expected, 'hex')
      if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) return true
    } catch { /* fall through */ }
    // base64 fallback
    const expectedB64 = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('base64')
    const sigB64 = Buffer.from(signatureHeader, 'base64')
    const expB64 = Buffer.from(expectedB64, 'base64')
    if (sigB64.length === expB64.length) {
      return timingSafeEqual(sigB64, expB64)
    }
    return false
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Token helpers (per-user OAuth token, with legacy API-key compatibility)
// ---------------------------------------------------------------------------

const refreshInFlight = new Map<string, Promise<string>>()

export async function getCalcomApiKey(userId: string): Promise<string | null> {
  const { token, error } = await getIntegrationToken(userId, 'calcom')
  if (error) throw new Error(error.message)
  if (!token?.accessToken) return null

  // API keys have no expiration. OAuth access tokens are refreshed one minute early.
  if (!token.expiresAt || new Date(token.expiresAt).getTime() > Date.now() + 60_000) {
    return token.accessToken
  }
  if (!token.refreshToken) return null

  const running = refreshInFlight.get(userId)
  if (running) return running
  const refresh = refreshCalcomOAuthToken(userId, token)
  refreshInFlight.set(userId, refresh)
  try {
    return await refresh
  } finally {
    refreshInFlight.delete(userId)
  }
}

async function refreshCalcomOAuthToken(
  userId: string,
  token: {
    accessToken: string
    refreshToken?: string | null
    expiresAt?: string | null
    scopes?: string[] | null
    meta?: Record<string, unknown> | null
  }
): Promise<string> {
  const clientId = process.env.CALCOM_CLIENT_ID
  const clientSecret = process.env.CALCOM_CLIENT_SECRET
  if (!clientId || !clientSecret || !token.refreshToken) {
    throw new Error('La conexión OAuth de Cal.com necesita renovarse')
  }
  const response = await fetch(`${BASE_URL}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken
    })
  })
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || typeof payload?.access_token !== 'string') {
    const detail = typeof payload?.error_description === 'string'
      ? payload.error_description
      : typeof payload?.error === 'string'
        ? payload.error
        : `HTTP ${response.status}`
    throw new Error(`No se pudo renovar Cal.com: ${detail}`)
  }

  const expiresIn = Number(payload.expires_in || 0)
  const refreshToken = typeof payload.refresh_token === 'string'
    ? payload.refresh_token
    : token.refreshToken
  const scopes = typeof payload.scope === 'string'
    ? payload.scope.split(/[\s,]+/).filter(Boolean)
    : token.scopes ?? null
  const { error } = await upsertIntegrationToken(userId, 'calcom', {
    accessToken: payload.access_token,
    refreshToken,
    expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    scopes,
    meta: token.meta ?? null
  })
  if (error) throw new Error(error.message)
  return payload.access_token
}

// ---------------------------------------------------------------------------
// Cal.com API helpers
// Note: Cal.com API v2 requires cal-api-version header on all calls.
// The caller receives a current access token from getCalcomApiKey.
// ---------------------------------------------------------------------------

async function calFetch<T>(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  path: string,
  apiKey: string,
  apiVersion: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'cal-api-version': apiVersion
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Cal.com API ${method} ${path} → ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Cal.com Types
// ---------------------------------------------------------------------------

export interface CalcomMe {
  email: string
  username: string | null
  name?: string | null
}

export interface CalcomWebhook {
  id: string
  payloadTemplate?: string | null
}

export interface CalcomWebhookCreated {
  id: string
  secret: string
}

export interface CalcomEventType {
  id: number
  slug: string
  title: string
  lengthInMinutes: number
  bookingUrl?: string
  locations?: Array<Record<string, unknown>>
}

export interface CalcomSlot {
  start: string
  end?: string
}

export interface CalcomBooking {
  id: number
  uid: string
  status: string
  start: string
  end: string
  location?: string | null
  meetingUrl?: string | null
  eventTypeId?: number
  metadata?: Record<string, string>
  rescheduledFromUid?: string | null
  rescheduledToUid?: string | null
  cancelledByEmail?: string | null
  cancellationReason?: string | null
}

export interface ResolvedCalcomDefaultEventType {
  apiKey: string
  eventType: CalcomEventType
}

export async function resolveCalcomDefaultEventType(userId: string): Promise<ResolvedCalcomDefaultEventType> {
  const [{ token, error }, apiKey] = await Promise.all([
    getIntegrationToken(userId, 'calcom'),
    getCalcomApiKey(userId)
  ])
  if (error) throw new Error(error.message)
  if (!apiKey || !token?.accessToken) {
    throw new Error('Conecta Cal.com en Integraciones antes de agendar llamadas.')
  }

  const meta = token.meta && typeof token.meta === 'object'
    ? token.meta as Record<string, unknown>
    : {}
  const defaultEventTypeId = Number(meta.default_event_type_id)
  if (!Number.isFinite(defaultEventTypeId) || defaultEventTypeId <= 0) {
    throw new Error('Selecciona un evento predeterminado de Cal.com en Integraciones antes de agendar llamadas.')
  }

  const eventTypes = await getCalcomEventTypes(apiKey)
  const eventType = eventTypes.find(event => event.id === defaultEventTypeId)
  if (!eventType) {
    throw new Error('El evento predeterminado de Cal.com ya no está disponible. Actualízalo en Integraciones.')
  }

  return { apiKey, eventType }
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export async function getCalcomMe(apiKey: string): Promise<CalcomMe> {
  const data = await calFetch<{ status: string; data: CalcomMe }>(
    'GET', '/me', apiKey, '2024-06-14'
  )
  return data.data
}

/**
 * Register a webhook on the recruiter's Cal.com account.
 * Returns { id, secret } to be stored in tokens_integracion.meta.
 */
export async function registerCalcomWebhook(
  apiKey: string,
  callbackUrl: string
): Promise<CalcomWebhookCreated> {
  // Always generate a secret so HMAC verification works
  const secret = randomBytes(32).toString('hex')
  const data = await calFetch<{ status: string; data: CalcomWebhookCreated & { secret?: string | null } }>(
    'POST',
    '/webhooks',
    apiKey,
    '2024-06-14',
    {
      subscriberUrl: callbackUrl,
      active: true,
      triggers: ['BOOKING_CREATED', 'BOOKING_CANCELLED', 'BOOKING_RESCHEDULED'],
      secret
    }
  )
  // Cal.com may echo back the secret or leave it null; fall back to what we sent
  return { id: data.data.id, secret: data.data.secret ?? secret }
}

/**
 * Delete a webhook from the recruiter's Cal.com account.
 * Called when the recruiter disconnects Cal.com integration.
 */
export async function deregisterCalcomWebhook(
  apiKey: string,
  webhookId: string
): Promise<void> {
  try {
    await calFetch<unknown>('DELETE', `/webhooks/${webhookId}`, apiKey, '2024-06-14')
  } catch (err) {
    // If already deleted (404), ignore
    if (err instanceof Error && err.message.includes('404')) return
    throw err
  }
}

/**
 * List event types for the recruiter.
 * Used to let recruiters pick which event type maps to an SP campaign.
 */
export async function getCalcomEventTypes(apiKey: string): Promise<CalcomEventType[]> {
  const data = await calFetch<{ status: string; data: CalcomEventType[] }>(
    'GET', '/event-types', apiKey, '2024-06-14'
  )
  return data.data ?? []
}

/**
 * Cancel a booking from the CRM.
 */
export async function cancelCalcomBooking(
  apiKey: string,
  bookingUid: string,
  reason?: string
): Promise<void> {
  try {
    await calFetch<unknown>(
      'POST',
      `/bookings/${bookingUid}/cancel`,
      apiKey,
      '2026-02-25',
      reason ? { cancellationReason: reason } : undefined
    )
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (message.includes('cancelled already') || message.includes('already cancelled')) return
    throw error
  }
}

export async function getCalcomBooking(
  apiKey: string,
  bookingUid: string
): Promise<CalcomBooking | null> {
  try {
    const response = await calFetch<{ status: string; data: CalcomBooking | CalcomBooking[] }>(
      'GET',
      `/bookings/${encodeURIComponent(bookingUid)}`,
      apiKey,
      '2026-02-25'
    )
    const booking = Array.isArray(response.data) ? response.data[0] : response.data
    return booking ?? null
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('404')) return null
    throw error
  }
}

export async function resolveCalcomBookingChain(
  apiKey: string,
  bookingUid: string,
  maxHops = 8
): Promise<{ booking: CalcomBooking | null; chain: string[]; status: 'active' | 'cancelled' | 'missing' }> {
  const chain: string[] = []
  const seen = new Set<string>()
  let currentUid: string | null = bookingUid

  for (let hop = 0; currentUid && hop < maxHops; hop += 1) {
    if (seen.has(currentUid)) break
    seen.add(currentUid)
    const booking = await getCalcomBooking(apiKey, currentUid)
    if (!booking) {
      chain.push(currentUid)
      return { booking: null, chain, status: 'missing' }
    }
    const uid = booking.uid || currentUid
    chain.push(uid)
    const status = (booking.status || '').toLowerCase()
    const nextUid = booking.rescheduledToUid || null
    if ((status === 'cancelled' || status === 'canceled') && nextUid && !seen.has(nextUid)) {
      currentUid = nextUid
      continue
    }
    return {
      booking,
      chain,
      status: status === 'cancelled' || status === 'canceled' ? 'cancelled' : 'active'
    }
  }

  return { booking: null, chain, status: 'missing' }
}

export async function getCalcomSlots(
  apiKey: string,
  input: {
    eventTypeId: number
    start: string
    end: string
    timeZone?: string
    bookingUidToReschedule?: string
  }
): Promise<Record<string, CalcomSlot[]>> {
  const params = new URLSearchParams({
    eventTypeId: String(input.eventTypeId),
    start: input.start,
    end: input.end,
    timeZone: input.timeZone || 'America/Mexico_City',
    format: 'range'
  })
  if (input.bookingUidToReschedule) {
    params.set('bookingUidToReschedule', input.bookingUidToReschedule)
  }
  const response = await calFetch<{ status: string; data: Record<string, CalcomSlot[]> }>(
    'GET',
    `/slots?${params.toString()}`,
    apiKey,
    '2024-09-04'
  )
  return response.data || {}
}

export async function createCalcomBooking(
  apiKey: string,
  input: {
    eventTypeId: number
    start: string
    attendee: {
      name: string
      email: string
      phoneNumber?: string
      timeZone?: string
      language?: string
    }
    guests?: string[]
    metadata?: Record<string, string>
    bookingFieldsResponses?: Record<string, unknown>
  }
): Promise<CalcomBooking> {
  const response = await calFetch<{ status: string; data: CalcomBooking }>(
    'POST',
    '/bookings',
    apiKey,
    '2026-02-25',
    {
      eventTypeId: input.eventTypeId,
      start: input.start,
      attendee: {
        name: input.attendee.name,
        email: input.attendee.email,
        phoneNumber: input.attendee.phoneNumber || undefined,
        timeZone: input.attendee.timeZone || 'America/Mexico_City',
        language: input.attendee.language || 'es'
      },
      guests: input.guests || undefined,
      metadata: input.metadata,
      bookingFieldsResponses: input.bookingFieldsResponses
    }
  )
  return response.data
}

export async function rescheduleCalcomBooking(
  apiKey: string,
  bookingUid: string,
  start: string,
  reason?: string
): Promise<CalcomBooking> {
  const response = await calFetch<{ status: string; data: CalcomBooking }>(
    'POST',
    `/bookings/${bookingUid}/reschedule`,
    apiKey,
    '2026-02-25',
    {
      start,
      reschedulingReason: reason || undefined
    }
  )
  return response.data
}

/**
 * Full connect flow: validate API key, call /me, register webhook, save to DB.
 * Called from POST /api/integraciones/calcom.
 */
export async function connectCalcom(
  usuarioId: string,
  apiKey: string
): Promise<{ organizer_email: string; webhook_id: string }> {
  const webhookUrl =
    process.env.CALCOM_WEBHOOK_URL ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/webhooks/calcom`

  if (!webhookUrl || webhookUrl === '/api/webhooks/calcom') {
    throw new Error('CALCOM_WEBHOOK_URL o NEXT_PUBLIC_APP_URL no configurado')
  }

  const me = await getCalcomMe(apiKey)
  const webhook = await registerCalcomWebhook(apiKey, webhookUrl)

  const { error } = await upsertIntegrationToken(usuarioId, 'calcom', {
    accessToken: apiKey,
    meta: {
      auth_method: 'api_key',
      organizer_email: me.email,
      username: me.username ?? null,
      webhook_id: webhook.id,
      webhook_secret: webhook.secret
    }
  })
  if (error) throw new Error(error.message)

  return { organizer_email: me.email, webhook_id: webhook.id }
}

export async function connectCalcomOAuth(
  usuarioId: string,
  token: {
    accessToken: string
    refreshToken?: string | null
    expiresAt?: string | null
    scopes?: string[] | null
  }
): Promise<{ organizer_email: string; webhook_id: string }> {
  const webhookUrl =
    process.env.CALCOM_WEBHOOK_URL ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/webhooks/calcom`
  if (!webhookUrl || webhookUrl === '/api/webhooks/calcom') {
    throw new Error('CALCOM_WEBHOOK_URL o NEXT_PUBLIC_APP_URL no configurado')
  }

  const existing = await getIntegrationToken(usuarioId, 'calcom')
  const existingMeta = existing.token?.meta ?? {}
  const previousWebhookId = typeof existingMeta.webhook_id === 'string'
    ? existingMeta.webhook_id
    : null
  if (previousWebhookId && existing.token?.accessToken) {
    await deregisterCalcomWebhook(existing.token.accessToken, previousWebhookId).catch(() => {})
  }

  const me = await getCalcomMe(token.accessToken)
  const webhook = await registerCalcomWebhook(token.accessToken, webhookUrl)
  const { error } = await upsertIntegrationToken(usuarioId, 'calcom', {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? null,
    expiresAt: token.expiresAt ?? null,
    scopes: token.scopes ?? null,
    meta: {
      ...existingMeta,
      auth_method: 'oauth',
      organizer_email: me.email,
      username: me.username ?? null,
      webhook_id: webhook.id,
      webhook_secret: webhook.secret
    }
  })
  if (error) {
    await deregisterCalcomWebhook(token.accessToken, webhook.id).catch(() => {})
    throw new Error(error.message)
  }
  return { organizer_email: me.email, webhook_id: webhook.id }
}

/**
 * Full disconnect flow: deregister webhook, remove token.
 * Called from DELETE /api/integraciones?provider=calcom.
 */
export async function disconnectCalcom(
  usuarioId: string,
  apiKey: string,
  webhookId: string
): Promise<void> {
  // A revoked/expired OAuth token must not prevent the user from removing the
  // local connection. Cal.com will eventually discard an unreachable webhook.
  await deregisterCalcomWebhook(apiKey, webhookId).catch(() => {})
  const supabase = ensureAdminClient()
  await supabase
    .from('tokens_integracion')
    .delete()
    .eq('usuario_id', usuarioId)
    .eq('proveedor', 'calcom')
}
