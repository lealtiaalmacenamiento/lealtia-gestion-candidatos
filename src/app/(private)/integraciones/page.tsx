"use client"

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import BasePage from '@/components/BasePage'
import type { IntegrationProviderKey } from '@/types'
import { providerLabel } from '@/lib/integrations/providerLabels'
import { useAuth } from '@/context/AuthProvider'

interface ManualStatus {
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
  manual?: ManualStatus
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
  },
  teams: {
    icon: 'bi-calendar3',
    description: 'Comparte tu sala de Microsoft Teams guardando un enlace personal.'
  },
  // calcom and sendpilot are managed via their own sections below, not the generic provider card loop
  calcom: { icon: 'bi-calendar-check-fill', description: '' },
  sendpilot: { icon: 'bi-send-fill', description: '' }
}

function formatExpire(expiresAt: string | null): string {
  if (!expiresAt) return 'Sin fecha registrada'
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return 'Fecha inválida'
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City'
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
  const [teamsForm, setTeamsForm] = useState({ meetingUrl: '', meetingId: '', meetingPassword: '' })
  const [teamsSaving, setTeamsSaving] = useState(false)

  const { user } = useAuth()

  // SendPilot state (org-level, admin/supervisor only)
  const [spConnected, setSpConnected] = useState(false)
  const [spForm, setSpForm] = useState({ apiKey: '', webhookSecret: '' })
  const [spSaving, setSpSaving] = useState(false)
  const [spDisconnecting, setSpDisconnecting] = useState(false)

  // Cal.com state (per-user)
  const [calConnected, setCalConnected] = useState(false)
  const [calInfo, setCalInfo] = useState<{ organizer_email?: string; username?: string } | null>(null)
  const [calApiKey, setCalApiKey] = useState('')
  const [calSaving, setCalSaving] = useState(false)
  const [calDisconnecting, setCalDisconnecting] = useState(false)

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
          meetingUrl: zoom?.manual?.settings?.meetingUrl ?? '',
          meetingId: zoom?.manual?.settings?.meetingId ?? '',
          meetingPassword: zoom?.manual?.settings?.meetingPassword ?? ''
        })
        const teams = fetched.find(item => item.provider === 'teams')
        setTeamsForm({
          meetingUrl: teams?.manual?.settings?.meetingUrl ?? '',
          meetingId: teams?.manual?.settings?.meetingId ?? '',
          meetingPassword: teams?.manual?.settings?.meetingPassword ?? ''
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando integraciones')
      } finally {
        setLoading(false)
      }
    }
    load().catch(() => {})

    // Load SP status (admin/supervisor)
    const loadSP = async () => {
      try {
        const res = await fetch('/api/integraciones/sendpilot', { cache: 'no-store' })
        if (res.ok) {
          const d = await res.json() as { connected: boolean }
          setSpConnected(d.connected)
        }
      } catch { /* ignore */ }
    }
    loadSP().catch(() => {})

    // Load Cal.com status (current user)
    const loadCal = async () => {
      try {
        const res = await fetch('/api/integraciones/calcom', { cache: 'no-store' })
        if (res.ok) {
          const d = await res.json() as { connected: boolean; organizer_email?: string; username?: string }
          setCalConnected(d.connected)
          if (d.connected) setCalInfo({ organizer_email: d.organizer_email, username: d.username })
        }
      } catch { /* ignore */ }
    }
    loadCal().catch(() => {})
  }, [])

  const handleSPSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSpSaving(true)
    setNotif(null)
    try {
      const res = await fetch('/api/integraciones/sendpilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: spForm.apiKey.trim(), webhook_secret: spForm.webhookSecret.trim() || undefined })
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error || `Error ${res.status}`)
      }
      setSpConnected(true)
      setSpForm(prev => ({ ...prev, apiKey: '' }))
      setNotif({ type: 'success', message: 'SendPilot conectado correctamente.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'No se pudo guardar SendPilot' })
    } finally {
      setSpSaving(false)
    }
  }

  const handleSPDisconnect = async () => {
    setSpDisconnecting(true)
    setNotif(null)
    try {
      const res = await fetch('/api/integraciones/sendpilot', { method: 'DELETE' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setSpConnected(false)
      setNotif({ type: 'info', message: 'SendPilot desconectado.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al desconectar SP' })
    } finally {
      setSpDisconnecting(false)
    }
  }

  const handleCalcomSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCalSaving(true)
    setNotif(null)
    try {
      const res = await fetch('/api/integraciones/calcom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: calApiKey.trim() })
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error || `Error ${res.status}`)
      }
      const d = await res.json() as { organizer_email?: string; username?: string }
      setCalConnected(true)
      setCalInfo({ organizer_email: d.organizer_email, username: d.username })
      setCalApiKey('')
      setNotif({ type: 'success', message: 'Cal.com conectado correctamente.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'No se pudo conectar Cal.com' })
    } finally {
      setCalSaving(false)
    }
  }

  const handleCalcomDisconnect = async () => {
    setCalDisconnecting(true)
    setNotif(null)
    try {
      const res = await fetch('/api/integraciones/calcom', { method: 'DELETE' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setCalConnected(false)
      setCalInfo(null)
      setNotif({ type: 'info', message: 'Cal.com desconectado.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al desconectar Cal.com' })
    } finally {
      setCalDisconnecting(false)
    }
  }

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
        if (provider === 'zoom' || provider === 'teams') {
          return { ...base, manual: { settings: null, legacy: false } }
        }
        return base
      }))
      if (provider === 'zoom') {
        setZoomForm({ meetingUrl: '', meetingId: '', meetingPassword: '' })
      } else if (provider === 'teams') {
        setTeamsForm({ meetingUrl: '', meetingId: '', meetingPassword: '' })
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
        manual: { settings: data.settings, legacy: false }
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

  const handleTeamsSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTeamsSaving(true)
    setNotif(null)
    try {
      const payload = {
        meetingUrl: teamsForm.meetingUrl.trim(),
        meetingId: teamsForm.meetingId.trim() || undefined,
        meetingPassword: teamsForm.meetingPassword.trim() || undefined
      }
      const res = await fetch('/api/integraciones/teams/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(detail.error || `Error ${res.status}`)
      }
      const data = await res.json() as { settings: { meetingUrl: string; meetingId?: string | null; meetingPassword?: string | null } }
      setProviders(prev => prev.map(p => p.provider === 'teams' ? {
        ...p,
        connected: true,
        expiresAt: null,
        scopes: ['manual'],
        manual: { settings: data.settings, legacy: false }
      } : p))
      setNotif({ type: 'success', message: 'Enlace de Microsoft Teams guardado correctamente.' })
      setTeamsForm({
        meetingUrl: data.settings.meetingUrl,
        meetingId: data.settings.meetingId ?? '',
        meetingPassword: data.settings.meetingPassword ?? ''
      })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'No se pudo guardar el enlace de Teams' })
    } finally {
      setTeamsSaving(false)
    }
  }

  return (
    <BasePage title="Integraciones de Calendario" alert={notif ? { type: notif.type === 'error' ? 'danger' : notif.type, message: notif.message, show: true } : undefined}>
      {loading && <div className="text-center py-4"><div className="spinner-border" /></div>}
      {!loading && error && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && (
        <div className="row g-4">
          {providers.filter(p => p.provider !== 'calcom' && p.provider !== 'sendpilot').map((provider) => {
            const meta = metaList[provider.provider]
            const isZoom = provider.provider === 'zoom'
            const isTeams = provider.provider === 'teams'
            const isManual = isZoom || isTeams
            const manualStatus = provider.manual
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
                    {!isManual && (
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
                    {isManual && (
                      <>
                        {isZoom && manualStatus?.legacy && (
                          <div className="alert alert-warning small mb-0">
                            Se encontró una conexión de Zoom antigua. Guarda tu enlace personal para completar la migración.
                          </div>
                        )}
                        <form
                          className="d-flex flex-column gap-3"
                          onSubmit={isZoom ? handleZoomSave : handleTeamsSave}
                        >
                          <div className="form-floating">
                            <input
                              type="url"
                              className="form-control"
                              id={`${provider.provider}-meeting-url`}
                              value={isZoom ? zoomForm.meetingUrl : teamsForm.meetingUrl}
                              onChange={(event) => {
                                const value = event.target.value
                                if (isZoom) {
                                  setZoomForm(prev => ({ ...prev, meetingUrl: value }))
                                } else {
                                  setTeamsForm(prev => ({ ...prev, meetingUrl: value }))
                                }
                              }}
                              placeholder={isZoom ? 'https://us06web.zoom.us/j/xxxxxxxx' : 'https://teams.microsoft.com/l/meetup-join/...'}
                              required
                            />
                            <label htmlFor={`${provider.provider}-meeting-url`}>Enlace personal</label>
                          </div>
                          <div className="form-floating">
                            <input
                              type="text"
                              className="form-control"
                              id={`${provider.provider}-meeting-id`}
                              value={isZoom ? zoomForm.meetingId : teamsForm.meetingId}
                              onChange={(event) => {
                                const value = event.target.value
                                if (isZoom) {
                                  setZoomForm(prev => ({ ...prev, meetingId: value }))
                                } else {
                                  setTeamsForm(prev => ({ ...prev, meetingId: value }))
                                }
                              }}
                              placeholder="Opcional"
                            />
                            <label htmlFor={`${provider.provider}-meeting-id`}>Meeting ID (opcional)</label>
                          </div>
                          <div className="form-floating">
                            <input
                              type="text"
                              className="form-control"
                              id={`${provider.provider}-meeting-password`}
                              value={isZoom ? zoomForm.meetingPassword : teamsForm.meetingPassword}
                              onChange={(event) => {
                                const value = event.target.value
                                if (isZoom) {
                                  setZoomForm(prev => ({ ...prev, meetingPassword: value }))
                                } else {
                                  setTeamsForm(prev => ({ ...prev, meetingPassword: value }))
                                }
                              }}
                              placeholder="Opcional"
                            />
                            <label htmlFor={`${provider.provider}-meeting-password`}>Contraseña (opcional)</label>
                          </div>
                          <div className="small bg-light rounded px-3 py-2">
                            <div className="fw-semibold mb-1">Estado</div>
                            <div>{provider.connected ? 'Enlace guardado' : 'Sin enlace guardado'}</div>
                          </div>
                          <div className="d-flex gap-2 mt-auto">
                            <button
                              type="submit"
                              className="btn btn-primary btn-sm flex-fill"
                              disabled={isZoom ? zoomSaving : teamsSaving}
                            >
                              {(isZoom ? zoomSaving : teamsSaving) ? 'Guardando…' : provider.connected ? 'Actualizar enlace' : 'Guardar enlace'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => handleDisconnect(provider.provider)}
                              disabled={disconnecting === provider.provider || (isZoom ? zoomSaving : teamsSaving)}
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

      {/* ── SendPilot (admin only) ────────────────────────────── */}
      {!loading && !error && user?.rol === 'admin' && (
        <div className="mt-5">
          <h5 className="fw-semibold mb-3"><i className="bi bi-send-fill me-2 text-primary"></i>SendPilot (automatización LinkedIn)</h5>
          <div className="card shadow-sm border-0">
            <div className="card-body d-flex flex-column gap-3">
              <div className="d-flex align-items-center gap-2">
                <span className={`badge ${spConnected ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}`}>
                  {spConnected ? 'Conectado' : 'Desconectado'}
                </span>
                <span className="small text-muted">Cuenta organizacional. Solo administradores pueden configurarla.</span>
              </div>
              <form className="d-flex flex-column gap-3" onSubmit={handleSPSave}>
                <div className="form-floating">
                  <input
                    type="password"
                    className="form-control"
                    id="sp-api-key"
                    value={spForm.apiKey}
                    onChange={e => setSpForm(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="sp_live_..."
                    autoComplete="new-password"
                    required
                  />
                  <label htmlFor="sp-api-key">API Key de SendPilot</label>
                </div>
                <div className="form-floating">
                  <input
                    type="password"
                    className="form-control"
                    id="sp-webhook-secret"
                    value={spForm.webhookSecret}
                    onChange={e => setSpForm(prev => ({ ...prev, webhookSecret: e.target.value }))}
                    placeholder="Secreto del webhook (opcional)"
                    autoComplete="new-password"
                  />
                  <label htmlFor="sp-webhook-secret">Webhook Secret (opcional)</label>
                </div>
                <div className="d-flex gap-2">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={spSaving}>
                    {spSaving ? 'Guardando…' : spConnected ? 'Actualizar credenciales' : 'Conectar SendPilot'}
                  </button>
                  {spConnected && (
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleSPDisconnect} disabled={spDisconnecting}>
                      {spDisconnecting ? 'Desconectando…' : 'Desconectar'}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Cal.com (reclutador segment only) ──────────────────────────── */}
      {!loading && !error && (user?.segmentos?.includes('reclutador') ?? false) && (
        <div className="mt-4 mb-5">
          <h5 className="fw-semibold mb-3"><i className="bi bi-calendar-check-fill me-2 text-primary"></i>Cal.com (agenda de entrevistas)</h5>
          <div className="card shadow-sm border-0">
            <div className="card-body d-flex flex-column gap-3">
              <div className="d-flex align-items-center gap-2">
                <span className={`badge ${calConnected ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}`}>
                  {calConnected ? 'Conectado' : 'Desconectado'}
                </span>
                {calConnected && calInfo && (
                  <span className="small text-muted">{calInfo.organizer_email ?? calInfo.username}</span>
                )}
              </div>
              {!calConnected ? (
                <form className="d-flex flex-column gap-3" onSubmit={handleCalcomSave}>
                  <div className="form-floating">
                    <input
                      type="password"
                      className="form-control"
                      id="calcom-api-key"
                      value={calApiKey}
                      onChange={e => setCalApiKey(e.target.value)}
                      placeholder="cal_live_..."
                      autoComplete="new-password"
                      required
                    />
                    <label htmlFor="calcom-api-key">API Key de Cal.com</label>
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={calSaving}>
                    {calSaving ? 'Conectando…' : 'Conectar Cal.com'}
                  </button>
                </form>
              ) : (
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleCalcomDisconnect} disabled={calDisconnecting}>
                    {calDisconnecting ? 'Desconectando…' : 'Desconectar Cal.com'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </BasePage>
  )
}
