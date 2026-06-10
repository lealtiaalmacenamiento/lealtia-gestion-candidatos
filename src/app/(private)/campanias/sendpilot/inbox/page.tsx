'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import BasePage from '@/components/BasePage'
import { useAuth } from '@/context/AuthProvider'

interface Participant {
  id: string
  name: string
  profileUrl: string
  profilePicture?: string
}

interface Conversation {
  id: string
  accountId: string
  participants: Participant[]
  lastMessage?: { content: string; sentAt: string; direction: 'sent' | 'received' }
  lastActivityAt: string
  unreadCount: number
}

interface ConvMessage {
  id: string
  content: string
  direction: 'sent' | 'received'
  sentAt: string
  readStatus: string
  contentType?: string
  attachments?: Array<{ type: string; url: string; name?: string; size?: number }>
}

interface Sender {
  id: string
  name: string
  profileUrl?: string
  status: string
}

interface Campaign {
  id: string
  name: string
  status: string
}

function normalizeLinkedinUrl(url: string): string {
  if (!url) return '#'
  if (url.startsWith('http')) return url
  if (url.startsWith('in/')) return `https://www.linkedin.com/${url}`
  return `https://www.linkedin.com/in/${url}`
}

/** Extract the slug from a LinkedIn URL for matching against DB linkedin_slug. Returns null for URNs. */
function normalizeLinkedinSlug(url: string): string | null {
  if (!url || url.startsWith('urn:')) return null
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

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function Avatar({ name, picture, size = 36 }: { name: string; picture?: string; size?: number }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
  const colors = ['#0a66c2', '#057642', '#b24020', '#6b2fa0', '#c37d16']
  const color = colors[(name.charCodeAt(0) ?? 0) % colors.length]
  if (picture) {
    return (
      <img src={picture} alt={name} width={size} height={size}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 600, fontSize: Math.round(size * 0.38), flexShrink: 0
    }}>
      {initials || '?'}
    </div>
  )
}

function formatShort(iso: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(iso))
}

function proxyUrl(attUrl: string): string {
  return `/api/sendpilot/attachment?url=${encodeURIComponent(attUrl)}`
}

function AttachmentBubble({ att, isSent, participantProfileUrl }: {
  att: { type: string; url: string; name?: string; size?: number }
  isSent: boolean
  participantProfileUrl?: string
}) {
  const dimColor = isSent ? 'rgba(255,255,255,0.75)' : '#6c757d'
  const borderColor = isSent ? 'rgba(255,255,255,0.3)' : '#dee2e6'

  if (!att.url) {
    // SP received a file/voice but doesn't expose the URL — link to LinkedIn so they can view it
    const icon = att.type === 'voice' ? 'bi-mic' : 'bi-paperclip'
    const label = att.type === 'voice' ? 'Nota de voz' : 'Archivo adjunto'
    const liUrl = participantProfileUrl
      ? `https://www.linkedin.com/messaging/`
      : 'https://www.linkedin.com/messaging/'
    return (
      <div className="mt-1">
        <a href={liUrl} target="_blank" rel="noopener noreferrer"
          className="d-inline-flex align-items-center gap-1 small text-decoration-none fst-italic"
          style={{ color: dimColor }}>
          <i className={`bi ${icon}`} />
          {label} · ver en
          <i className="bi bi-linkedin ms-1" />
          LinkedIn
          <i className="bi bi-box-arrow-up-right" style={{ fontSize: '0.65rem' }} />
        </a>
      </div>
    )
  }

  if (att.type === 'linkedin_post') {
    return (
      <div className="mt-1">
        <a href={att.url} target="_blank" rel="noopener noreferrer"
          className="d-inline-flex align-items-center gap-1 small text-decoration-none"
          style={{ color: isSent ? '#cfe2ff' : '#0a66c2' }}>
          <i className="bi bi-linkedin" />
          Ver publicación de LinkedIn
          <i className="bi bi-box-arrow-up-right" style={{ fontSize: '0.65rem' }} />
        </a>
      </div>
    )
  }

  if (att.type === 'img') {
    return (
      <div className="mt-1">
        <a href={proxyUrl(att.url)} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyUrl(att.url)} alt="Imagen adjunta"
            style={{ maxWidth: 220, maxHeight: 180, borderRadius: 8, border: `1px solid ${borderColor}`, display: 'block' }}
            onError={e => {
              const el = e.currentTarget as HTMLImageElement
              el.style.display = 'none'
              const p = el.parentElement
              if (p) p.innerHTML = `<span class="small fst-italic" style="color:${dimColor}">🖼 Imagen (no disponible)</span>`
            }}
          />
        </a>
      </div>
    )
  }

  if (att.type === 'video') {
    return (
      <div className="mt-1">
        <video controls style={{ maxWidth: 260, borderRadius: 8, border: `1px solid ${borderColor}` }}>
          <source src={proxyUrl(att.url)} />
          <a href={proxyUrl(att.url)} target="_blank" rel="noopener noreferrer"
            className="small" style={{ color: dimColor }}>▶ Ver video</a>
        </video>
      </div>
    )
  }

  // file / unknown with url
  const sizeLabel = att.size ? ` · ${(att.size / 1024).toFixed(0)} KB` : ''
  return (
    <div className="mt-1">
      <a href={proxyUrl(att.url)} download={att.name ?? true} target="_blank" rel="noopener noreferrer"
        className="d-inline-flex align-items-center gap-2 px-2 py-1 rounded small text-decoration-none"
        style={{ background: borderColor, color: isSent ? '#fff' : '#212529' }}>
        <i className="bi bi-file-earmark-arrow-down" />
        <span>{att.name ?? 'Descargar archivo'}{sizeLabel}</span>
      </a>
    </div>
  )
}

export default function InboxPage() {
  const { user, loadingUser } = useAuth()
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const esReclutador = user?.segmentos?.includes('reclutador') ?? false

  useEffect(() => {
    if (!loadingUser && user && !esReclutador) router.replace('/home')
  }, [loadingUser, user, esReclutador, router])

  // ── Conversations ──────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [notif, setNotif] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // ── Filter meta ────────────────────────────────
  const [senders, setSenders] = useState<Sender[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)

  // ── Active filters ─────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSender, setFilterSender] = useState('')
  const [filterCampaign, setFilterCampaign] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  // campaign leads: slug set (primary) + name set (fallback for URN-based profileUrls)
  const [campaignNames, setCampaignNames] = useState<Set<string> | null>(null)
  const [campaignSlugs, setCampaignSlugs] = useState<Set<string> | null>(null)
  const [loadingCampaignLeads, setLoadingCampaignLeads] = useState(false)

  // ── Selected conversation ──────────────────────
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ConvMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [messagesContinuationToken, setMessagesContinuationToken] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  // ── Load campaigns + senders on mount ──────────
  useEffect(() => {
    fetch('/api/sendpilot/campaigns', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { campaigns: [] })
      .then((d: { campaigns: Campaign[] }) => setCampaigns(d.campaigns ?? []))
      .catch(() => {})
  }, [])

  // ── Resolve sender names from messages ──────────────────────────────────
  // SP sets sender.name = "Me"; the recruiter's real name is in recipient.name of sent messages.
  // We try multiple conversations per accountId until we find one with a sent message.
  useEffect(() => {
    if (!conversations.length) return

    // Group all convIds per accountId, sent-lastMessage ones first
    const accountConvsMap = new Map<string, string[]>()
    for (const c of conversations) {
      const list = accountConvsMap.get(c.accountId) ?? []
      if (c.lastMessage?.direction === 'sent') list.unshift(c.id)
      else list.push(c.id)
      accountConvsMap.set(c.accountId, list)
    }

    const resolve = async () => {
      const derived: Sender[] = await Promise.all(
        [...accountConvsMap.entries()].map(async ([accountId, convIds], i) => {
          for (const convId of convIds) {
            try {
              const res = await fetch(
                `/api/sendpilot/inbox/${convId}/messages?account_id=${encodeURIComponent(accountId)}`,
                { cache: 'no-store' }
              )
              if (!res.ok) continue
              const data = await res.json() as { messages: Array<{ direction: string; recipient: { name: string } }> }
              const sentMsg = data.messages?.find(m => m.direction === 'sent')
              if (sentMsg?.recipient?.name) {
                return { id: accountId, name: sentMsg.recipient.name, status: 'active' }
              }
            } catch { /* try next */ }
          }
          return { id: accountId, name: `Perfil LinkedIn ${i + 1}`, status: 'active' }
        })
      )
      setSenders(derived)
    }
    resolve().catch(() => {})
  }, [conversations])

  // ── When campaign filter changes, load its leads ─
  // Primary match: linkedin_slug vs normalized participant profileUrl
  // Fallback:       normalized lead nombre vs participant name (for URN-based profileUrls)
  useEffect(() => {
    if (!filterCampaign) { setCampaignNames(null); setCampaignSlugs(null); return }
    setLoadingCampaignLeads(true)
    fetch(`/api/sendpilot/campaign-leads?id=${encodeURIComponent(filterCampaign)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { names: [], slugs: [] })
      .then((d: { names?: string[]; slugs?: string[] }) => {
        setCampaignNames(new Set(d.names ?? []))
        setCampaignSlugs(new Set(d.slugs ?? []))
      })
      .catch(() => { setCampaignNames(null); setCampaignSlugs(null) })
      .finally(() => setLoadingCampaignLeads(false))
  }, [filterCampaign])

  // ── Conversations pagination ───────────────────
  const [convsPage, setConvsPage] = useState(1)
  const [convsHasMore, setConvsHasMore] = useState(false)
  const [loadingMoreConvs, setLoadingMoreConvs] = useState(false)

  // ── Load first page of conversations ─────────
  const loadConversations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/sendpilot/inbox?page=1&limit=50', { cache: 'no-store' })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `Error ${res.status}`)
      }
      const data = await res.json() as { conversations: Conversation[]; pagination: { hasMore: boolean } }
      setConversations(data.conversations ?? [])
      setConvsHasMore(data.pagination?.hasMore ?? false)
      setConvsPage(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar inbox')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMoreConversations = useCallback(async () => {
    if (loadingMoreConvs || !convsHasMore) return
    setLoadingMoreConvs(true)
    const nextPage = convsPage + 1
    try {
      const res = await fetch(`/api/sendpilot/inbox?page=${nextPage}&limit=50`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as { conversations: Conversation[]; pagination: { hasMore: boolean } }
      setConversations(prev => {
        const map = new Map(prev.map(c => [c.id, c]))
        for (const c of data.conversations ?? []) map.set(c.id, c)
        return Array.from(map.values())
      })
      setConvsHasMore(data.pagination?.hasMore ?? false)
      setConvsPage(nextPage)
    } catch { /* silent */ } finally {
      setLoadingMoreConvs(false)
    }
  }, [convsPage, convsHasMore, loadingMoreConvs])

  useEffect(() => { loadConversations().catch(() => {}) }, [loadConversations])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSelectedConv(null)
    setMessages([])
    await loadConversations().catch(() => {})
    setSyncing(false)
  }, [loadConversations])

  // ── Load messages for a conversation ──────────
  const handleSelectConversation = useCallback(async (conv: Conversation) => {
    setSelectedConv(conv)
    setMessages([])
    setMessagesContinuationToken(null)
    setReplyText('')
    setLoadingMessages(true)
    try {
      const res = await fetch(
        `/api/sendpilot/inbox/${conv.id}/messages?account_id=${encodeURIComponent(conv.accountId)}`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `Error ${res.status}`)
      }
      const data = await res.json() as { messages: ConvMessage[]; pagination?: { hasMore: boolean; continuationToken?: string } }
      setMessages((data.messages ?? []).slice().reverse())
      setMessagesContinuationToken(data.pagination?.continuationToken ?? null)
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al cargar mensajes' })
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  // ── Load older messages ────────────────────────
  const handleLoadOlderMessages = useCallback(async () => {
    if (!selectedConv || !messagesContinuationToken || loadingOlderMessages) return
    setLoadingOlderMessages(true)
    try {
      const url = `/api/sendpilot/inbox/${selectedConv.id}/messages?account_id=${encodeURIComponent(selectedConv.accountId)}&continuationToken=${encodeURIComponent(messagesContinuationToken)}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as { messages: ConvMessage[]; pagination?: { hasMore: boolean; continuationToken?: string } }
      setMessages(prev => [...(data.messages ?? []).slice().reverse(), ...prev])
      setMessagesContinuationToken(data.pagination?.continuationToken ?? null)
    } catch { /* silent */ } finally {
      setLoadingOlderMessages(false)
    }
  }, [selectedConv, messagesContinuationToken, loadingOlderMessages])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── Send reply ─────────────────────────────────
  const handleReply = async () => {
    if (!selectedConv || !replyText.trim()) return
    const recipientLinkedinUrl = selectedConv.participants[0]?.profileUrl
    if (!recipientLinkedinUrl) {
      setNotif({ type: 'error', message: 'No se encontró el perfil LinkedIn del destinatario' })
      return
    }
    setSending(true)
    setNotif(null)
    try {
      const res = await fetch(`/api/sendpilot/inbox/${selectedConv.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: selectedConv.accountId, recipientLinkedinUrl, message: replyText.trim() })
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `Error ${res.status}`)
      }
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), content: replyText.trim(),
        direction: 'sent', sentAt: new Date().toISOString(), readStatus: 'sent'
      }])
      setReplyText('')
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al enviar' })
    } finally {
      setSending(false)
    }
  }

  // ── Active filter count ────────────────────────
  const activeFilters = [filterSender, filterCampaign, filterDateFrom, filterDateTo].filter(Boolean).length

  const clearFilters = () => {
    setFilterSender('')
    setFilterCampaign('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  // ── Apply all filters ──────────────────────────
  const filteredConvs = conversations.filter(c => {
    const q = searchQuery.toLowerCase().trim()
    if (q) {
      const nameMatch = c.participants.some(p => p.name.toLowerCase().includes(q))
      const msgMatch = c.lastMessage?.content.toLowerCase().includes(q) ?? false
      if (!nameMatch && !msgMatch) return false
    }
    if (filterSender && c.accountId !== filterSender) return false
    if (filterCampaign && (campaignSlugs !== null || campaignNames !== null)) {
      const profileUrl = c.participants[0]?.profileUrl ?? ''
      // Primary: match by linkedin slug (works when SP returns URL-based profileUrls)
      const slug = normalizeLinkedinSlug(profileUrl)
      if (campaignSlugs !== null && campaignSlugs.size > 0 && slug && campaignSlugs.has(slug)) {
        // slug match ✔ — include this conversation
      } else {
        // Fallback: match by normalized participant name (handles URN-based profileUrls)
        const partName = normalizeName(c.participants[0]?.name ?? '')
        if (!campaignNames?.has(partName)) return false
      }
    }
    if (filterDateFrom) {
      if (new Date(c.lastActivityAt) < new Date(filterDateFrom)) return false
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo)
      to.setHours(23, 59, 59, 999)
      if (new Date(c.lastActivityAt) > to) return false
    }
    return true
  })

  if (loadingUser || !esReclutador) {
    return (
      <BasePage title="Inbox LinkedIn">
        <div className="text-center py-5"><div className="spinner-border text-primary" /></div>
      </BasePage>
    )
  }

  return (
    <BasePage
      title="Inbox LinkedIn"
      alert={notif ? { type: notif.type === 'error' ? 'danger' : 'success', message: notif.message, show: true } : undefined}
    >
      {/* ── Top bar ── */}
      <div className="d-flex justify-content-between align-items-center mb-2 gap-2 flex-wrap">
        <div className="d-flex align-items-center gap-2">
          <span className="text-muted small">
            {loading ? 'Cargando…' : `${filteredConvs.length} de ${conversations.length} conversación${conversations.length !== 1 ? 'es' : ''}`}
          </span>
          <button
            className={`btn btn-sm ${filtersOpen ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setFiltersOpen(o => !o)}
          >
            <i className="bi bi-funnel me-1" />
            Filtros
            {activeFilters > 0 && (
              <span className="badge bg-danger ms-1" style={{ fontSize: '0.65rem' }}>{activeFilters}</span>
            )}
          </button>
          {activeFilters > 0 && (
            <button className="btn btn-sm btn-link text-danger p-0" onClick={clearFilters}>
              <i className="bi bi-x-circle me-1" />Limpiar
            </button>
          )}
        </div>
        <button className="btn btn-outline-primary btn-sm" onClick={handleSync} disabled={syncing || loading}>
          {(syncing || loading)
            ? <><span className="spinner-border spinner-border-sm me-1" />Cargando...</>
            : <><i className="bi bi-arrow-clockwise me-1" />Sincronizar</>}
        </button>
      </div>

      {/* ── Filter panel ── */}
      {filtersOpen && (
        <div className="card mb-2 border-primary-subtle">
          <div className="card-body py-2 px-3">
            <div className="row g-2 align-items-end">
              <div className="col-12 col-sm-6 col-md-3">
                <label className="form-label form-label-sm text-muted mb-1">Perfil LinkedIn (sender)</label>
                <select className="form-select form-select-sm" value={filterSender} onChange={e => setFilterSender(e.target.value)}>
                  <option value="">Todos</option>
                  {senders.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-sm-6 col-md-3">
                <label className="form-label form-label-sm text-muted mb-1">
                  Campaña
                  {loadingCampaignLeads && <span className="spinner-border spinner-border-sm ms-1" style={{ width: 10, height: 10 }} />}
                </label>
                <select className="form-select form-select-sm" value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)}>
                  <option value="">Todas</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label form-label-sm text-muted mb-1">Desde</label>
                <input type="date" className="form-control form-control-sm" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label form-label-sm text-muted mb-1">Hasta</label>
                <input type="date" className="form-control form-control-sm" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="row g-0 border rounded" style={{ height: 'calc(100vh - 220px)', overflow: 'hidden', minHeight: 0 }}>

        {/* ─── Conversation list ─── */}
        <div className="col-12 col-md-4 border-end d-flex flex-column" style={{ overflow: 'hidden', minHeight: 0, height: '100%' }}>
          <div className="p-2 border-bottom bg-white">
            <div className="input-group input-group-sm">
              <span className="input-group-text border-end-0 bg-white">
                <i className="bi bi-search text-muted" style={{ fontSize: '0.8rem' }} />
              </span>
              <input type="text" className="form-control border-start-0 ps-0"
                placeholder="Buscar persona o mensaje…"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              {searchQuery && (
                <button className="btn btn-outline-secondary" onClick={() => setSearchQuery('')}>
                  <i className="bi bi-x" />
                </button>
              )}
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {loading && !conversations.length && (
              <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-secondary" /></div>
            )}
            {error && <div className="alert alert-danger m-2 small">{error}</div>}
            {!loading && !error && filteredConvs.length === 0 && (
              <div className="text-muted text-center py-4 small">
                {searchQuery || activeFilters > 0 ? 'Sin resultados con los filtros actuales' : 'Sin conversaciones'}
              </div>
            )}
            {filteredConvs.map(conv => {
              const p = conv.participants[0]
              const last = conv.lastMessage
              return (
                <div key={conv.id}
                  className={`p-3 border-bottom d-flex gap-2 align-items-center ${selectedConv?.id === conv.id ? 'bg-primary-subtle' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleSelectConversation(conv).catch(() => {})}>
                  <Avatar name={p?.name ?? '?'} picture={p?.profilePicture} size={40} />
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="d-flex justify-content-between align-items-baseline gap-1">
                      <div className="fw-semibold small text-truncate">
                        {p?.name ?? '—'}
                        {conv.unreadCount > 0 && (
                          <span className="badge bg-primary ms-1" style={{ fontSize: '0.6rem' }}>{conv.unreadCount}</span>
                        )}
                      </div>
                      {last && <div className="text-muted flex-shrink-0" style={{ fontSize: '0.68rem' }}>{formatShort(last.sentAt)}</div>}
                    </div>
                    {last && (
                      <div className="text-truncate text-muted" style={{ fontSize: '0.78rem' }}>
                        {last.direction === 'sent' ? 'Tú: ' : ''}{last.content || '📎 Adjunto'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {convsHasMore && (
              <div className="text-center py-2">
                <button
                  className="btn btn-sm btn-outline-secondary"
                  disabled={loadingMoreConvs}
                  onClick={() => loadMoreConversations().catch(() => {})}>
                  {loadingMoreConvs
                    ? <><span className="spinner-border spinner-border-sm me-1" />Cargando...</>
                    : 'Cargar más conversaciones'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Messages panel ─── */}
        <div className="col-12 col-md-8 d-flex flex-column" style={{ overflow: 'hidden', minHeight: 0, height: '100%' }}>
          {!selectedConv ? (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted">
              <div className="text-center">
                <i className="bi bi-chat-dots display-5 d-block mb-2 opacity-25" />
                <span className="small">Selecciona una conversación</span>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 border-bottom bg-white d-flex align-items-center gap-3" style={{ flexShrink: 0 }}>
                <Avatar name={selectedConv.participants[0]?.name ?? '?'} picture={selectedConv.participants[0]?.profilePicture} size={44} />
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="fw-semibold">{selectedConv.participants[0]?.name ?? '—'}</div>
                  <a href={normalizeLinkedinUrl(selectedConv.participants[0]?.profileUrl ?? '')}
                    target="_blank" rel="noopener noreferrer"
                    className="small text-decoration-none d-inline-flex align-items-center gap-1"
                    style={{ color: '#0a66c2' }}>
                    <i className="bi bi-linkedin" />
                    <span className="text-truncate" style={{ maxWidth: 260 }}>{selectedConv.participants[0]?.profileUrl}</span>
                    <i className="bi bi-box-arrow-up-right" style={{ fontSize: '0.65rem' }} />
                  </a>
                </div>
              </div>

              <div className="flex-grow-1 p-3 d-flex flex-column gap-2" style={{ overflowY: 'auto', background: '#f8f9fa', minHeight: 0 }}>
                {loadingMessages && <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-secondary" /></div>}
                {!loadingMessages && messagesContinuationToken && (
                  <div className="text-center pb-1">
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      disabled={loadingOlderMessages}
                      onClick={() => handleLoadOlderMessages().catch(() => {})}>
                      {loadingOlderMessages
                        ? <><span className="spinner-border spinner-border-sm me-1" />Cargando...</>
                        : <><i className="bi bi-arrow-up-circle me-1" />Mensajes anteriores</>}
                    </button>
                  </div>
                )}
                {!loadingMessages && messages.length === 0 && (
                  <div className="text-muted text-center small py-4">Sin mensajes en esta conversación</div>
                )}
                {messages.map((msg, i) => {
                  const prev = messages[i - 1]
                  const dayFmt = (iso: string) =>
                    new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'America/Mexico_City' }).format(new Date(iso))
                  const showSep = !prev || dayFmt(prev.sentAt) !== dayFmt(msg.sentAt)
                  return (
                    <div key={msg.id}>
                      {showSep && (
                        <div className="text-center my-2">
                          <span className="badge bg-secondary-subtle text-secondary fw-normal px-3" style={{ fontSize: '0.7rem' }}>
                            {dayFmt(msg.sentAt)}
                          </span>
                        </div>
                      )}
                      <div className={`d-flex align-items-end gap-2 ${msg.direction === 'sent' ? 'justify-content-end' : 'justify-content-start'}`}>
                        {msg.direction === 'received' && (
                          <Avatar name={selectedConv.participants[0]?.name ?? '?'} picture={selectedConv.participants[0]?.profilePicture} size={26} />
                        )}
                        <div className={`rounded-3 px-3 py-2 small shadow-sm ${msg.direction === 'sent' ? 'bg-primary text-white' : 'bg-white border'}`}
                          style={{ maxWidth: '72%' }}>
                          {(msg.content || !msg.attachments?.length) && (
                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {msg.content || <span className="fst-italic opacity-75">(sin texto)</span>}
                            </div>
                          )}
                          {msg.attachments?.map((att, ai) => (
                            <AttachmentBubble key={ai} att={att} isSent={msg.direction === 'sent'}
                              participantProfileUrl={selectedConv.participants[0]?.profileUrl} />
                          ))}
                          <div className={`mt-1 text-end ${msg.direction === 'sent' ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '0.65rem' }}>
                            {new Intl.DateTimeFormat('es-MX', { timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(msg.sentAt))}
                            {msg.direction === 'sent' && (
                              <i className={`bi ms-1 ${msg.readStatus === 'read' ? 'bi-check2-all' : 'bi-check2'}`} />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-top bg-white" style={{ flexShrink: 0 }}>
                <div className="d-flex gap-2 align-items-end">
                  <textarea className="form-control form-control-sm" rows={2}
                    placeholder="Escribe un mensaje…"
                    value={replyText} onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleReply() } }}
                    disabled={sending} style={{ resize: 'none' }} />
                  <button className="btn btn-primary btn-sm d-flex align-items-center justify-content-center"
                    onClick={() => void handleReply()} disabled={sending || !replyText.trim()}
                    style={{ minWidth: 40, height: 58 }}>
                    {sending ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-send-fill" />}
                  </button>
                </div>
                <div className="mt-1 text-muted" style={{ fontSize: '0.7rem' }}>
                  Enter para enviar · Shift+Enter para nueva línea
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </BasePage>
  )
}