'use client'

import { useEffect, useState, useCallback } from 'react'
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
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City'
  }).format(new Date(iso))
}

export default function InboxPage() {
  const { user, loadingUser } = useAuth()
  const router = useRouter()

  const esReclutador = user?.segmentos?.includes('reclutador') ?? false

  useEffect(() => {
    if (!loadingUser && user && !esReclutador) router.replace('/home')
  }, [loadingUser, user, esReclutador, router])

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [notif, setNotif] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ConvMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const loadConversations = useCallback(async (pg: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/sendpilot/inbox?page=${pg}&limit=50`, { cache: 'no-store' })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `Error ${res.status}`)
      }
      const data = await res.json() as {
        conversations: Conversation[]
        pagination: { hasMore: boolean; page: number }
      }
      setConversations(prev => pg === 1 ? (data.conversations ?? []) : [...prev, ...(data.conversations ?? [])])
      setHasMore(data.pagination?.hasMore ?? false)
      setPage(data.pagination?.page ?? pg)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar inbox')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConversations(1).catch(() => {}) }, [loadConversations])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSelectedConv(null)
    setMessages([])
    await loadConversations(1).catch(() => {})
    setSyncing(false)
  }, [loadConversations])

  const handleSelectConversation = useCallback(async (conv: Conversation) => {
    setSelectedConv(conv)
    setMessages([])
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
      const data = await res.json() as { messages: ConvMessage[] }
      setMessages(data.messages ?? [])
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al cargar mensajes' })
    } finally {
      setLoadingMessages(false)
    }
  }, [])

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
        body: JSON.stringify({
          senderId: selectedConv.accountId,
          recipientLinkedinUrl,
          message: replyText.trim()
        })
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `Error ${res.status}`)
      }
      const newMsg: ConvMessage = {
        id: crypto.randomUUID(),
        content: replyText.trim(),
        direction: 'sent',
        sentAt: new Date().toISOString(),
        readStatus: 'sent'
      }
      setMessages(prev => [newMsg, ...prev])
      setReplyText('')
      setNotif({ type: 'success', message: 'Mensaje enviado.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al enviar' })
    } finally {
      setSending(false)
    }
  }

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
      <div className="d-flex justify-content-end mb-2">
        <button
          className="btn btn-outline-primary btn-sm"
          onClick={handleSync}
          disabled={syncing || loading}
        >
          {(syncing || loading)
            ? <><span className="spinner-border spinner-border-sm me-1" />Cargando...</>
            : <><i className="bi bi-arrow-clockwise me-1" />Sincronizar</>}
        </button>
      </div>

      <div className="row g-0 border rounded" style={{ height: 'calc(100vh - 220px)', overflow: 'hidden' }}>
        {/* Conversation list */}
        <div className="col-12 col-md-4 border-end d-flex flex-column" style={{ overflowY: 'auto' }}>
          {loading && !conversations.length && (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm" /></div>
          )}
          {error && <div className="alert alert-danger m-2 small">{error}</div>}
          {!loading && !error && conversations.length === 0 && (
            <div className="text-muted text-center py-4 small">Sin conversaciones</div>
          )}
          {conversations.map(conv => {
            const participant = conv.participants[0]
            const last = conv.lastMessage
            return (
              <div
                key={conv.id}
                className={`p-3 border-bottom ${selectedConv?.id === conv.id ? 'bg-primary-subtle' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleSelectConversation(conv).catch(() => {})}
              >
                <div className="d-flex justify-content-between align-items-baseline gap-1">
                  <div className="fw-semibold small text-truncate">
                    {participant?.name ?? '—'}
                    {conv.unreadCount > 0 && (
                      <span className="badge bg-primary ms-1" style={{ fontSize: '0.65rem' }}>{conv.unreadCount}</span>
                    )}
                  </div>
                  {last && <div className="text-muted flex-shrink-0" style={{ fontSize: '0.7rem' }}>{formatDate(last.sentAt)}</div>}
                </div>
                {last && (
                  <div className="small text-muted text-truncate">
                    {last.direction === 'sent' ? 'Tú: ' : ''}{last.content}
                  </div>
                )}
              </div>
            )
          })}
          {hasMore && (
            <div className="p-2 text-center">
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => loadConversations(page + 1).catch(() => {})}
                disabled={loading}
              >
                {loading ? 'Cargando…' : 'Cargar más'}
              </button>
            </div>
          )}
        </div>

        {/* Messages panel */}
        <div className="col-12 col-md-8 d-flex flex-column" style={{ overflow: 'hidden' }}>
          {!selectedConv && (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted">
              Selecciona una conversación
            </div>
          )}
          {selectedConv && (
            <>
              <div className="p-3 border-bottom bg-light">
                <div className="fw-semibold">{selectedConv.participants[0]?.name ?? '—'}</div>
                <a
                  href={selectedConv.participants[0]?.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="small text-muted"
                >
                  <i className="bi bi-linkedin me-1 text-primary"></i>
                  {selectedConv.participants[0]?.profileUrl}
                </a>
              </div>

              <div className="flex-grow-1 p-3 d-flex flex-column gap-2" style={{ overflowY: 'auto' }}>
                {loadingMessages && (
                  <div className="text-center py-3"><div className="spinner-border spinner-border-sm" /></div>
                )}
                {!loadingMessages && messages.length === 0 && (
                  <div className="text-muted text-center small">Sin mensajes</div>
                )}
                {messages.slice().reverse().map(msg => (
                  <div key={msg.id} className={`d-flex ${msg.direction === 'sent' ? 'justify-content-end' : 'justify-content-start'}`}>
                    <div
                      className={`rounded px-3 py-2 small ${msg.direction === 'sent' ? 'bg-primary text-white' : 'bg-light border'}`}
                      style={{ maxWidth: '75%' }}
                    >
                      <div>{msg.content}</div>
                      <div className={`mt-1 ${msg.direction === 'sent' ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '0.7rem' }}>
                        {formatDate(msg.sentAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 border-top d-flex gap-2">
                <textarea
                  className="form-control form-control-sm"
                  rows={2}
                  placeholder="Escribe un mensaje…"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleReply()
                    }
                  }}
                  disabled={sending}
                />
                <button
                  className="btn btn-primary btn-sm align-self-end"
                  onClick={() => void handleReply()}
                  disabled={sending || !replyText.trim()}
                >
                  {sending ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-send-fill"></i>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </BasePage>
  )
}
