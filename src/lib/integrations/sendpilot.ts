import { createHmac, timingSafeEqual } from 'crypto'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { decrypt, type EncryptedPayload } from '@/lib/encryption'

const BASE_URL = 'https://api.sendpilot.ai/v1'

// ---------------------------------------------------------------------------
// Signature verification
// Header format: Webhook-Signature: v1,t={timestamp},s={hmac-hex}
// Signed message: "{timestamp}.{rawBody}"
// Algorithm: HMAC-SHA256
// ---------------------------------------------------------------------------

export function verifySendPilotSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false
  try {
    const parts = signatureHeader.split(',')
    let timestamp = ''
    let signature = ''
    for (const part of parts) {
      if (part.startsWith('t=')) timestamp = part.slice(2)
      if (part.startsWith('s=')) signature = part.slice(2)
    }
    if (!timestamp || !signature) return false

    // Replay attack protection: reject events older than 5 minutes
    const ts = parseInt(timestamp, 10)
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Org-level API key retrieval (SP is one account for the whole company)
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

export async function getSendPilotApiKey(): Promise<string | null> {
  const supabase = ensureAdminClient()
  const { data } = await supabase
    .from('tokens_integracion')
    .select('access_token')
    .eq('proveedor', 'sendpilot')
    .limit(1)
    .maybeSingle()
  return data?.access_token ? unpackToken(data.access_token) : null
}

export async function getSendPilotWebhookSecret(): Promise<string | null> {
  const supabase = ensureAdminClient()
  const { data } = await supabase
    .from('tokens_integracion')
    .select('meta')
    .eq('proveedor', 'sendpilot')
    .limit(1)
    .maybeSingle()
  return (data?.meta as Record<string, unknown> | null)?.webhook_secret as string | null
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function spFetch<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const apiKey = await getSendPilotApiKey()
  if (!apiKey) throw new Error('SendPilot: API key no configurada')

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`SendPilot API ${method} ${path} → ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// SP Types
// ---------------------------------------------------------------------------

export interface SPCampaign {
  id: string
  name: string
  status: string
}

export interface SPLeadInput {
  linkedinUrl: string
  firstName?: string
  lastName?: string
  company?: string
  title?: string
}

export interface SPLead {
  id: string
  linkedinUrl: string
  firstName?: string
  lastName?: string
  status: string
}

export interface SPMessage {
  id: string
  direction: 'sent' | 'received'
  content: string
  sentAt: string
}

export interface SPThread {
  leadId: string
  linkedinUrl: string
  messages: SPMessage[]
}

export interface SPInboxResponse {
  threads: SPThread[]
  nextCursor: string | null
}

// ---------------------------------------------------------------------------
// Outbound API methods (CRM → SendPilot)
// ---------------------------------------------------------------------------

export async function getCampaigns(): Promise<SPCampaign[]> {
  const data = await spFetch<{ campaigns?: SPCampaign[] } | SPCampaign[]>('GET', '/campaigns')
  return Array.isArray(data) ? data : (data as { campaigns?: SPCampaign[] }).campaigns ?? []
}

export async function getLeads(
  spCampaignId: string,
  page = 1,
  limit = 50
): Promise<{ leads: SPLead[]; totalPages: number }> {
  const params = new URLSearchParams({ campaignId: spCampaignId, page: String(page), limit: String(limit) })
  const data = await spFetch<{ leads?: SPLead[]; pagination?: { totalPages: number } }>(
    'GET',
    `/leads?${params.toString()}`
  )
  return {
    leads: data.leads ?? [],
    totalPages: data.pagination?.totalPages ?? 1
  }
}

export async function pauseCampaign(spCampaignId: string): Promise<void> {
  await spFetch<unknown>('POST', `/campaigns/${spCampaignId}/pause`)
}

export async function resumeCampaign(spCampaignId: string): Promise<void> {
  await spFetch<unknown>('POST', `/campaigns/${spCampaignId}/resume`)
}

export async function addLead(campaignId: string, lead: SPLeadInput): Promise<SPLead> {
  return spFetch<SPLead>('POST', '/leads', { campaignId, ...lead })
}

export async function updateLeadStatus(spContactId: string, status: string): Promise<void> {
  await spFetch<unknown>('PUT', `/leads/${spContactId}`, { status })
}

// ---------------------------------------------------------------------------
// Conversations API (real SP endpoints)
// ---------------------------------------------------------------------------

export interface SPSender {
  id: string
  name: string
  profileUrl?: string
  status: string
}

export interface SPConversationParticipant {
  id: string
  name: string
  profileUrl: string
  profilePicture?: string
}

export interface SPConversation {
  id: string
  accountId: string
  participants: SPConversationParticipant[]
  lastMessage?: {
    content: string
    sentAt: string
    direction: 'sent' | 'received'
  }
  lastActivityAt: string
  unreadCount: number
  createdAt: string
  updatedAt: string
}

export interface SPConversationsResponse {
  conversations: SPConversation[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

export interface SPConversationMessage {
  id: string
  content: string
  sender: { id: string; name: string; profileUrl: string }
  recipient: { id: string; name: string; profileUrl: string }
  direction: 'sent' | 'received'
  sentAt: string
  readStatus: 'read' | 'unread' | 'unknown'
  contentType: string
}

export interface SPConversationMessagesResponse {
  conversationId: string
  messages: SPConversationMessage[]
  pagination: { hasMore: boolean; continuationToken?: string }
}

export async function getSenders(): Promise<SPSender[]> {
  const data = await spFetch<{ senders?: SPSender[] } | SPSender[]>('GET', '/senders')
  return Array.isArray(data) ? data : (data as { senders?: SPSender[] }).senders ?? []
}

export async function getConversations(
  accountId?: string,
  page = 1,
  limit = 50
): Promise<SPConversationsResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (accountId) params.set('accountId', accountId)
  try {
    return await spFetch<SPConversationsResponse>('GET', `/inbox/conversations?${params.toString()}`)
  } catch (err) {
    // SP returns 500 when the requested page exceeds available data — treat as end of results
    const msg = err instanceof Error ? err.message : ''
    if (/→ 5\d\d:/.test(msg) || /→ 404:/.test(msg)) {
      return { conversations: [], pagination: { page, limit, total: 0, totalPages: page - 1, hasMore: false } }
    }
    throw err
  }
}

export async function getConversationMessages(
  conversationId: string,
  accountId: string,
  limit = 50,
  continuationToken?: string
): Promise<SPConversationMessagesResponse> {
  const params = new URLSearchParams({ accountId, limit: String(limit) })
  if (continuationToken) params.set('continuationToken', continuationToken)
  return spFetch<SPConversationMessagesResponse>(
    'GET',
    `/inbox/conversations/${conversationId}/messages?${params.toString()}`
  )
}

export async function sendDirectMessage(
  senderId: string,
  recipientLinkedinUrl: string,
  message: string,
  leadId?: string
): Promise<{ messageId: string; status?: string }> {
  const body: Record<string, string> = { senderId, recipientLinkedinUrl, message }
  if (leadId) body.leadId = leadId
  return spFetch<{ messageId: string; status?: string }>('POST', '/inbox/send', body)
}

// ---------------------------------------------------------------------------
// Legacy inbox helpers (kept for reference, replaced by Conversations API above)
// ---------------------------------------------------------------------------

/** @deprecated Use getConversations() instead */
export async function getInbox(
  campaignId: string,
  cursor?: string
): Promise<SPInboxResponse> {
  const params = new URLSearchParams({ campaignId, limit: '50' })
  if (cursor) params.set('cursor', cursor)
  return spFetch<SPInboxResponse>('GET', `/inbox?${params.toString()}`)
}

/** @deprecated Use sendDirectMessage() instead */
export async function replyToThread(threadId: string, message: string): Promise<void> {
  await spFetch<unknown>('POST', `/inbox/${threadId}/reply`, { message })
}

// ---------------------------------------------------------------------------
// LinkedIn URL helpers (used by webhook handler)
// ---------------------------------------------------------------------------

/**
 * Parse SP's internal LinkedIn URL format:
 * "in/jose-alberto-cano-luna-053ab71a4?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAAC..."
 *
 * Returns:
 *   linkedin_url : canonical "https://www.linkedin.com/in/{slug}"
 *   linkedin_urn : invariable internal ID ("ACoAAC...")
 *   linkedin_slug: just the slug for matching ("jose-alberto-cano-luna-053ab71a4")
 */
export function parseSpLinkedinUrl(rawUrl: string): {
  linkedin_url: string
  linkedin_urn: string | null
  linkedin_slug: string
} {
  // Strip leading protocol/domain if present
  const cleaned = rawUrl
    .replace(/^https?:\/\/www\.linkedin\.com\//i, '')
    .replace(/^https?:\/\/linkedin\.com\//i, '')

  let slug = ''
  let linkedin_urn: string | null = null

  try {
    const url = new URL('https://www.linkedin.com/' + cleaned)
    // slug is the path segment after "in/"
    const pathParts = url.pathname.split('/').filter(Boolean)
    const inIdx = pathParts.indexOf('in')
    slug = inIdx >= 0 ? pathParts[inIdx + 1] ?? '' : pathParts[0] ?? ''

    // Extract miniProfileUrn → ID is the last :-separated segment
    const urnParam = url.searchParams.get('miniProfileUrn')
    if (urnParam) {
      const decoded = decodeURIComponent(urnParam)
      const parts = decoded.split(':')
      linkedin_urn = parts[parts.length - 1] ?? null
    }
  } catch {
    // Fallback: treat the whole string as slug
    slug = cleaned.replace(/^in\//, '').split('?')[0]
  }

  const linkedin_url = `https://www.linkedin.com/in/${slug}`
  return { linkedin_url, linkedin_urn, linkedin_slug: slug }
}

/**
 * Extract the slug from any LinkedIn URL for case-insensitive matching.
 * Handles both https://www.linkedin.com/in/slug and bare slugs.
 */
export function normalizeLinkedInSlug(url: string | null): string | null {
  if (!url) return null
  try {
    const u = url.includes('://') ? new URL(url) : new URL('https://www.linkedin.com/in/' + url)
    const parts = u.pathname.split('/').filter(Boolean)
    const inIdx = parts.indexOf('in')
    const slug = inIdx >= 0 ? parts[inIdx + 1] : parts[0]
    return slug ? slug.toLowerCase() : null
  } catch {
    return null
  }
}
