'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import BasePage from '@/components/BasePage'
import { useAuth } from '@/context/AuthProvider'

interface Message {
  id: string
  direction: 'sent' | 'received'
  content: string
  sentAt: string
}

interface Thread {
  leadId: string
  linkedinUrl: string
  messages: Message[]
}

interface Campana {
  id: string
  nombre: string
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

  const [threads, setThreads] = useState<Thread[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [spErrors, setSpErrors] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)
  const [campanas, setCampanas] = useState<Campana[]>([])
  const [selectedCampana, setSelectedCampana] = useState<string>('')
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [notif, setNotif] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    fetch('/api/sp/campanas', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.resolve({ items: [] }))
      .then((d: { items: Campana[] }) => setCampanas(d.items ?? []))
      .catch(() => {})
  }, [])

  const load = useCallback(async (cursor?: string) => {
    setLoading(true)
    setError(null)
    setSpErrors([])
    try {
      const params = new URLSearchParams()
      if (selectedCampana) params.set('campana_id', selectedCampana)
      if (cursor) params.set('cursor', cursor)
      const res = await fetch(`/api/sendpilot/inbox?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json() as { threads: Thread[]; nextCursor: string | null; errors?: string[] }
      setThreads(prev => cursor ? [...prev, ...(data.threads ?? [])] : (data.threads ?? []))
      setNextCursor(data.nextCursor)
      if (data.errors?.length) setSpErrors(data.errors)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar inbox')
    } finally {
      setLoading(false)
    }
  }, [selectedCampana])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setThreads([])
    setNextCursor(null)
    setSelectedThread(null)
    await load().catch(() => {})
    setSyncing(false)
  }, [load])

  useEffect(() => {
    setThreads([])
    setNextCursor(null)
    setSelectedThread(null)
    load().catch(() => {})
  }, [load])

  const handleReply = async () => {
    if (!selectedThread || !replyText.trim()) return
    setSending(true)
    setNotif(null)
    try {
      const res = await fetch(`/api/sendpilot/inbox/${selectedThread.leadId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() })
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `Error ${res.status}`)
      }
      // Optimistically append the sent message
      const newMsg: Message = {
        id: crypto.randomUUID(),
        direction: 'sent',
        content: replyText.trim(),
        sentAt: new Date().toISOString()
      }
      setSelectedThread(prev => prev ? { ...prev, messages: [newMsg, ...prev.messages] } : prev)
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
      title="Inbox SendPilot"
      alert={notif ? { type: notif.type === 'error' ? 'danger' : 'success', message: notif.message, show: true } : undefined}
    >
      <div className="d-flex justify-content-end mb-2">
        <button
          className="btn btn-outline-primary btn-sm"
          onClick={handleSync}
          disabled={syncing || loading}
        >
          {(syncing || loading) ? <><span className="spinner-border spinner-border-sm me-1" />Cargando...</> : <><i className="bi bi-arrow-clockwise me-1" />Sincronizar</>}
        </button>
      </div>
      {spErrors.length > 0 && (
        <div className="alert alert-warning small py-2">
          <strong>Errores al consultar SP:</strong> {spErrors.join(' | ')}
        </div>
      )}
      <div className="row g-0" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Thread list */}
        <div className="col-12 col-md-4 border-end" style={{ overflowY: 'auto' }}>
          <div className="p-2 border-bottom">
            <select
              className="form-select form-select-sm"
              value={selectedCampana}
              onChange={e => setSelectedCampana(e.target.value)}
            >
              <option value="">Todas las campañas</option>
              {campanas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          {loading && !threads.length && (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm" /></div>
          )}
          {error && <div className="alert alert-danger m-2 small">{error}</div>}

          {threads.map(t => {
            const lastMsg = t.messages[0]
            return (
              <div
                key={t.leadId}
                className={`p-3 border-bottom cursor-pointer ${selectedThread?.leadId === t.leadId ? 'bg-primary-subtle' : 'hover-bg-light'}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedThread(t)}
              >
                <div className="d-flex justify-content-between align-items-baseline">
                  <div className="fw-semibold small text-truncate">{t.linkedinUrl}</div>
                  {lastMsg && <div className="text-muted" style={{ fontSize: '0.7rem' }}>{formatDate(lastMsg.sentAt)}</div>}
                </div>
                {lastMsg && (
                  <div className="small text-muted text-truncate">
                    {lastMsg.direction === 'sent' ? 'Tú: ' : ''}{lastMsg.content}
                  </div>
                )}
              </div>
            )
          })}

          {nextCursor && (
            <div className="p-2 text-center">
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => load(nextCursor).catch(() => {})}
                disabled={loading}
              >
                {loading ? 'Cargando…' : 'Cargar más'}
              </button>
            </div>
          )}
        </div>

        {/* Conversation panel */}
        <div className="col-12 col-md-8 d-flex flex-column" style={{ overflowY: 'auto' }}>
          {!selectedThread && (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted">
              Selecciona una conversación
            </div>
          )}
          {selectedThread && (
            <>
              <div className="p-3 border-bottom">
                <a href={`https://www.linkedin.com/in/${selectedThread.linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="fw-semibold">
                  <i className="bi bi-linkedin me-1"></i>
                  {selectedThread.linkedinUrl}
                </a>
              </div>

              <div className="flex-grow-1 p-3 d-flex flex-column gap-2" style={{ overflowY: 'auto' }}>
                {selectedThread.messages.slice().reverse().map(msg => (
                  <div
                    key={msg.id}
                    className={`d-flex ${msg.direction === 'sent' ? 'justify-content-end' : 'justify-content-start'}`}
                  >
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
                />
                <button
                  className="btn btn-primary btn-sm align-self-end"
                  onClick={handleReply}
                  disabled={sending || !replyText.trim()}
                >
                  {sending ? '…' : <i className="bi bi-send-fill"></i>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </BasePage>
  )
}
