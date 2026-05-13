import { createHmac, timingSafeEqual } from 'crypto'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { decrypt, type EncryptedPayload } from '@/lib/encryption'
import { upsertIntegrationToken } from '@/lib/integrationTokens'

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
// Token helpers (per-user — each recruiter has their own Cal.com API key)
// ---------------------------------------------------------------------------

function unpackToken(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const payload = JSON.parse(value) as EncryptedPayload
    return decrypt(payload)
  } catch {
    return value as string
  }
}

export async function getCalcomApiKey(userId: string): Promise<string | null> {
  const supabase = ensureAdminClient()
  const { data } = await supabase
    .from('tokens_integracion')
    .select('access_token')
    .eq('usuario_id', userId)
    .eq('proveedor', 'calcom')
    .maybeSingle()
  return data?.access_token ? unpackToken(data.access_token) : null
}

// ---------------------------------------------------------------------------
// Cal.com API helpers
// Note: Cal.com API v2 requires cal-api-version header on all calls.
// With API key auth, no token refresh is needed (keys don't expire).
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
  length: number
  schedulingUrl?: string
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
  const data = await calFetch<{ status: string; data: CalcomWebhookCreated }>(
    'POST',
    '/webhooks',
    apiKey,
    '2024-06-14',
    {
      subscriberUrl: callbackUrl,
      active: true,
      triggers: ['BOOKING_CREATED', 'BOOKING_CANCELLED', 'BOOKING_RESCHEDULED']
    }
  )
  return data.data
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
  await calFetch<unknown>(
    'POST',
    `/bookings/${bookingUid}/cancel`,
    apiKey,
    '2024-06-14',
    reason ? { reason } : undefined
  )
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
      organizer_email: me.email,
      username: me.username ?? null,
      webhook_id: webhook.id,
      webhook_secret: webhook.secret
    }
  })
  if (error) throw new Error(error.message)

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
  await deregisterCalcomWebhook(apiKey, webhookId)
  const supabase = ensureAdminClient()
  await supabase
    .from('tokens_integracion')
    .delete()
    .eq('usuario_id', usuarioId)
    .eq('proveedor', 'calcom')
}
