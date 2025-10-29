"use client";

import { useEffect, useRef, useState } from 'react'

const parsedMinutes = Number(process.env.NEXT_PUBLIC_SESSION_MAX_AGE_MINUTES)
const DEFAULT_MINUTES = Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes : 5
const SESSION_TTL_MS = DEFAULT_MINUTES * 60 * 1000
const WARNING_THRESHOLD_MS = 30 * 1000
const CHECK_INTERVAL_MS = 1000

export default function SessionTimeoutPrompt() {
  const [visible, setVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const warnShownRef = useRef(false)
  const lastActivityRef = useRef<number>(Date.now())
  const keepAliveRef = useRef<number>(Date.now())
  const keepAlivePromiseRef = useRef<Promise<boolean> | null>(null)

  useEffect(() => {
    lastActivityRef.current = Date.now()
    keepAliveRef.current = Date.now()
    const markActivity = () => {
      lastActivityRef.current = Date.now()
      if (warnShownRef.current) return
      setVisible(false)
    }
    const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'] as const
    events.forEach((event) => window.addEventListener(event, markActivity, { passive: true }))
    return () => {
      events.forEach((event) => window.removeEventListener(event, markActivity))
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      const timeSinceActivity = now - lastActivityRef.current
      const timeLeft = SESSION_TTL_MS - timeSinceActivity
      if (timeLeft <= 0) {
        window.location.href = '/login?timeout=1'
        return
      }
      if (timeLeft <= WARNING_THRESHOLD_MS) {
        if (!warnShownRef.current) {
          warnShownRef.current = true
          console.info('[SessionTimeoutPrompt] Mostrando aviso de expiración inminente. Tiempo restante (s):', Math.round(timeLeft / 1000))
          setVisible(true)
        }
      }
    }, CHECK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [visible])

  const requestKeepAlive = () => {
    if (keepAlivePromiseRef.current) return keepAlivePromiseRef.current
    const now = Date.now()
    keepAliveRef.current = now
    console.info('[SessionTimeoutPrompt] Enviando keep-alive. Segundos desde última actividad:', Math.round((now - lastActivityRef.current) / 1000))
    const promise = fetch('/api/session/refresh', { method: 'POST', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'No se pudo mantener la sesión activa')
        }
        warnShownRef.current = false
        setVisible(false)
        setError(null)
        console.info('[SessionTimeoutPrompt] Keep-alive exitoso.')
        return true
      })
      .catch((err) => {
        console.warn('[SessionTimeoutPrompt] Error al ejecutar keep-alive:', err)
        setError(err instanceof Error ? err.message : 'Error al mantener la sesión activa')
        setVisible(true)
        return false
      })
      .finally(() => {
        keepAlivePromiseRef.current = null
      })
    keepAlivePromiseRef.current = promise
    return promise
  }

  const handleStay = async () => {
    setRefreshing(true)
    await requestKeepAlive()
    setRefreshing(false)
  }

  const handleSignOut = () => {
    window.location.href = '/login?timeout=1'
  }

  if (!visible) return null

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', zIndex: 1100 }}>
      <div className="card shadow" style={{ maxWidth: 400 }}>
        <div className="card-header bg-warning fw-semibold">Tu sesión está por expirar</div>
        <div className="card-body">
          <p className="mb-3">Han pasado varios minutos sin actividad. ¿Quieres mantener tu sesión activa?</p>
          {error && <div className="alert alert-danger py-2 small">{error}</div>}
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={handleSignOut} disabled={refreshing}>
              Cerrar sesión
            </button>
            <button type="button" className="btn btn-primary" onClick={handleStay} disabled={refreshing}>
              {refreshing ? 'Extendiendo…' : 'Continuar sesión'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
