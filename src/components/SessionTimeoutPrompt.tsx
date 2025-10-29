"use client";

import { useEffect, useRef, useState } from 'react'

const parsedMinutes = Number(process.env.NEXT_PUBLIC_SESSION_MAX_AGE_MINUTES)
const DEFAULT_MINUTES = Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes : 15
const SESSION_TTL_MS = DEFAULT_MINUTES * 60 * 1000
const WARNING_THRESHOLD_MS = 30 * 1000
const CHECK_INTERVAL_MS = 1000

export default function SessionTimeoutPrompt() {
  const [visible, setVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeLeftMs, setTimeLeftMs] = useState(SESSION_TTL_MS)
  const warnShownRef = useRef(false)
  const lastActivityRef = useRef<number>(Date.now())
  const keepAlivePromiseRef = useRef<Promise<boolean> | null>(null)
  const autoLogoutRef = useRef(false)

  useEffect(() => {
    const now = Date.now()
    lastActivityRef.current = now
    setTimeLeftMs(SESSION_TTL_MS)
    const markActivity = () => {
      const activityNow = Date.now()
      lastActivityRef.current = activityNow
      setTimeLeftMs(SESSION_TTL_MS)
      autoLogoutRef.current = false
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
      setTimeLeftMs(Math.max(0, timeLeft))
      if (timeLeft <= 0) {
        window.location.href = '/login?timeout=1'
        return
      }
      if (timeLeft <= WARNING_THRESHOLD_MS) {
        if (!warnShownRef.current) {
          warnShownRef.current = true
          setVisible(true)
        }
      }
    }, CHECK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [visible])

  useEffect(() => {
    if (!visible) return
    if (timeLeftMs > 0) return
    if (autoLogoutRef.current) return
    autoLogoutRef.current = true
    void signOutAndRedirect()
  }, [timeLeftMs, visible])

  const requestKeepAlive = () => {
    if (keepAlivePromiseRef.current) return keepAlivePromiseRef.current
    const promise = fetch('/api/session/refresh', { method: 'POST', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'No se pudo mantener la sesión activa')
        }
        const refreshMoment = Date.now()
        lastActivityRef.current = refreshMoment
        setTimeLeftMs(SESSION_TTL_MS)
        warnShownRef.current = false
        autoLogoutRef.current = false
        setVisible(false)
        setError(null)
        return true
      })
      .catch((err) => {
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

  const signOutAndRedirect = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', cache: 'no-store' })
    } catch {
    } finally {
      window.location.href = '/login?timeout=1'
    }
  }

  const handleSignOut = () => {
    autoLogoutRef.current = true
    void signOutAndRedirect()
  }

  if (!visible) return null

  const secondsLeft = Math.max(0, Math.ceil(timeLeftMs / 1000))

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', zIndex: 1100 }}>
      <div className="card shadow" style={{ maxWidth: 400 }}>
        <div className="card-header bg-warning fw-semibold">Tu sesión está por expirar</div>
        <div className="card-body">
          <p className="mb-3">Han pasado varios minutos sin actividad. ¿Quieres mantener tu sesión activa?</p>
          <p className="mb-3 small text-muted">Tu sesión se cerrará en aproximadamente <strong>{secondsLeft}</strong> segundos.</p>
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
