"use client"

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import BasePage from '@/components/BasePage'
import type { IntegrationProviderKey } from '@/types'
import { providerLabel } from '@/lib/integrations/providerLabels'

interface ProviderStatus {
  provider: IntegrationProviderKey
  connected: boolean
  expiresAt: string | null
  scopes: string[] | null
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
    description: 'Crea reuniones de Zoom y comparte enlaces al agendar.'
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
        setProviders(data.providers || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando integraciones')
      } finally {
        setLoading(false)
      }
    }
    load().catch(() => {})
  }, [])

  const handleConnect = (provider: IntegrationProviderKey) => {
    window.location.assign(`/api/integraciones/${provider}/start`)
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
      setProviders(prev => prev.map(p => p.provider === provider ? { ...p, connected: false, expiresAt: null, scopes: null } : p))
      setNotif({ type: 'info', message: `${providerLabel(provider)} desconectado.` })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al desconectar' })
    } finally {
      setDisconnecting(null)
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
                    <div className="small bg-light rounded px-3 py-2">
                      <div className="fw-semibold mb-1">Estado del token</div>
                      <div>Expira: {formatExpire(provider.expiresAt)}</div>
                      <div>Scopes: {provider.scopes && provider.scopes.length > 0 ? provider.scopes.join(', ') : '—'}</div>
                    </div>
                    <div className="d-flex gap-2 mt-auto">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm flex-fill"
                        onClick={() => handleConnect(provider.provider)}
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
