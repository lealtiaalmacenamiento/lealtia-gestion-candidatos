"use client"

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import BasePage from '@/components/BasePage'
import type { IntegrationProviderKey } from '@/types'
import { providerLabel } from '@/lib/integrations/providerLabels'

interface ZoomManualStatus {
  settings: {
    meetingUrl: string
    meetingId?: string | null
    meetingPassword?: string | null
  } | null
  legacy: boolean
}

interface ProviderStatus {
  provider: IntegrationProviderKey
  connected: boolean
  expiresAt: string | null
  scopes: string[] | null
  zoomManual?: ZoomManualStatus
}

interface StatusResponse {
  providers: ProviderStatus[]
}

const PROVIDER_META: Record<IntegrationProviderKey, { icon: string; description: string; doc?: string }> = {
  google: {
    icon: 'bi-google',
    description: 'Sincroniza Google Calendar y genera enlaces de Google Meet automáticamente.'
  },
  zoom: {
    icon: 'bi-camera-video-fill',
    description: 'Guarda tu enlace personal de Zoom para compartirlo al agendar.'
  }
}

function formatExpire(expiresAt: string | null): string {
  if (!expiresAt) return 'Sin fecha registrada'
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return 'Fecha inválida'
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

export default function IntegracionesPage() {
  const params = useSearchParams()
  const statusParam = params.get('status')
  const providerParam = params.get('provider') as IntegrationProviderKey | null
  const messageParam = params.get('message')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notif, setNotif] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [disconnecting, setDisconnecting] = useState<IntegrationProviderKey | null>(null)
  const [zoomForm, setZoomForm] = useState({ meetingUrl: '', meetingId: '', meetingPassword: '' })
  const [zoomSaving, setZoomSaving] = useState(false)

  const metaList = useMemo(() => PROVIDER_META, [])

  useEffect(() => {
    if (statusParam && providerParam) {
      if (statusParam === 'success') {
        setNotif({ type: 'success', message: `${providerLabel(providerParam)} conectado correctamente.` })
      } else if (statusParam === 'error') {
        setNotif({ type: 'error', message: messageParam || `No se pudo conectar ${providerLabel(providerParam)}.` })
      }
    }
  }, [statusParam, providerParam, messageParam])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/integraciones', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Error ${res.status}`)
        const data = (await res.json()) as StatusResponse
        const fetched = data.providers || []
        setProviders(fetched)
        const zoom = fetched.find(item => item.provider === 'zoom')
        setZoomForm({
          meetingUrl: zoom?.zoomManual?.settings?.meetingUrl ?? '',
          meetingId: zoom?.zoomManual?.settings?.meetingId ?? '',
          meetingPassword: zoom?.zoomManual?.settings?.meetingPassword ?? ''
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando integraciones')
      } finally {
        setLoading(false)
      }
    }
    load().catch(() => {})
  }, [])

  const handleDisconnect = async (provider: IntegrationProviderKey) => {
    setDisconnecting(provider)
    setNotif(null)
    try {
      const res = await fetch(`/api/integraciones?provider=${provider}`, { method: 'DELETE' })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || `Error ${res.status}`)
      }
      setProviders(prev => prev.map(p => {
        if (p.provider !== provider) return p
        const base = { ...p, connected: false, expiresAt: null, scopes: null }
        if (provider === 'zoom') {
          return { ...base, zoomManual: { settings: null, legacy: false } }
        }
        return base
      }))
      if (provider === 'zoom') {
        setZoomForm({ meetingUrl: '', meetingId: '', meetingPassword: '' })
      }
      setNotif({ type: 'info', message: `${providerLabel(provider)} desconectado.` })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al desconectar' })
    } finally {
      setDisconnecting(null)
    }
  }

  const handleZoomSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setZoomSaving(true)
    setNotif(null)
    try {
      const payload = {
        meetingUrl: zoomForm.meetingUrl.trim(),
        meetingId: zoomForm.meetingId.trim() || undefined,
        meetingPassword: zoomForm.meetingPassword.trim() || undefined
      }
      const res = await fetch('/api/integraciones/zoom/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(detail.error || `Error ${res.status}`)
      }
      const data = await res.json() as { settings: { meetingUrl: string; meetingId?: string | null; meetingPassword?: string | null } }
      setProviders(prev => prev.map(p => p.provider === 'zoom' ? {
        ...p,
        connected: true,
        expiresAt: null,
        scopes: ['manual'],
        zoomManual: { settings: data.settings, legacy: false }
      } : p))
      setNotif({ type: 'success', message: 'Enlace de Zoom guardado correctamente.' })
      setZoomForm({
        meetingUrl: data.settings.meetingUrl,
        meetingId: data.settings.meetingId ?? '',
        meetingPassword: data.settings.meetingPassword ?? ''
      })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'No se pudo guardar el enlace de Zoom' })
    } finally {
      setZoomSaving(false)
    }
  }

  return (
    <BasePage title="Integraciones de Calendario" alert={notif ? { type: notif.type === 'error' ? 'danger' : notif.type, message: notif.message, show: true } : undefined}>
      {loading && <div className="text-center py-4"><div className="spinner-border" /></div>}
      {!loading && error && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && (
        <div className="row g-4">
          {providers.map((provider) => {
            const meta = metaList[provider.provider]
            const isZoom = provider.provider === 'zoom'
            return (
              <div className="col-12 col-md-4" key={provider.provider}>
                <div className="card h-100 shadow-sm border-0">
                  <div className="card-body d-flex flex-column gap-3">
                    <div className="d-flex align-items-center gap-2">
                      <i className={`fs-3 text-primary ${meta?.icon ?? 'bi-plug'}`}></i>
                      <div>
                        <h6 className="fw-semibold mb-0">{providerLabel(provider.provider)}</h6>
                        <span className={`badge ${provider.connected ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}`}>
                          {provider.connected ? 'Conectado' : 'Desconectado'}
                        </span>
                      </div>
                    </div>
                    <p className="small text-muted mb-0">{meta?.description}</p>
                    {!isZoom && (
                      <>
                        <div className="small bg-light rounded px-3 py-2">
                          <div className="fw-semibold mb-1">Estado del token</div>
                          <div>Expira: {formatExpire(provider.expiresAt)}</div>
                          <div>Scopes: {provider.scopes && provider.scopes.length > 0 ? provider.scopes.join(', ') : '—'}</div>
                        </div>
                        <div className="d-flex gap-2 mt-auto">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm flex-fill"
                            onClick={() => window.location.assign(`/api/integraciones/${provider.provider}/start`)}
                          >
                            {provider.connected ? 'Renovar conexión' : 'Conectar'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => handleDisconnect(provider.provider)}
                            disabled={!provider.connected || disconnecting === provider.provider}
                          >
                            {disconnecting === provider.provider ? 'Desconectando…' : 'Desconectar'}
                          </button>
                        </div>
                      </>
                    )}
                    {isZoom && (
                      <>
                        {provider.zoomManual?.legacy && (
                          <div className="alert alert-warning small mb-0">
                            Se encontró una conexión de Zoom antigua. Guarda tu enlace personal para completar la migración.
                          </div>
                        )}
                        <form className="d-flex flex-column gap-3" onSubmit={handleZoomSave}>
                          <div className="form-floating">
                            <input
                              type="url"
                              className="form-control"
                              id="zoomMeetingUrl"
                              value={zoomForm.meetingUrl}
                              onChange={(event) => setZoomForm(prev => ({ ...prev, meetingUrl: event.target.value }))}
                              placeholder="https://us06web.zoom.us/j/xxxxxxxx"
                              required
                            />
                            <label htmlFor="zoomMeetingUrl">Enlace personal</label>
                          </div>
                          <div className="form-floating">
                            <input
                              type="text"
                              className="form-control"
                              id="zoomMeetingId"
                              value={zoomForm.meetingId}
                              onChange={(event) => setZoomForm(prev => ({ ...prev, meetingId: event.target.value }))}
                              placeholder="Opcional"
                            />
                            <label htmlFor="zoomMeetingId">Meeting ID (opcional)</label>
                          </div>
                          <div className="form-floating">
                            <input
                              type="text"
                              className="form-control"
                              id="zoomMeetingPassword"
                              value={zoomForm.meetingPassword}
                              onChange={(event) => setZoomForm(prev => ({ ...prev, meetingPassword: event.target.value }))}
                              placeholder="Opcional"
                            />
                            <label htmlFor="zoomMeetingPassword">Contraseña (opcional)</label>
                          </div>
                          <div className="small bg-light rounded px-3 py-2">
                            <div className="fw-semibold mb-1">Estado</div>
                            <div>{provider.connected ? 'Enlace guardado' : 'Sin enlace guardado'}</div>
                          </div>
                          <div className="d-flex gap-2 mt-auto">
                            <button type="submit" className="btn btn-primary btn-sm flex-fill" disabled={zoomSaving}>
                              {zoomSaving ? 'Guardando…' : provider.connected ? 'Actualizar enlace' : 'Guardar enlace'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => handleDisconnect(provider.provider)}
                              disabled={disconnecting === provider.provider || zoomSaving}
                            >
                              {disconnecting === provider.provider ? 'Limpiando…' : 'Quitar enlace'}
                            </button>
                          </div>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </BasePage>
  )
}
