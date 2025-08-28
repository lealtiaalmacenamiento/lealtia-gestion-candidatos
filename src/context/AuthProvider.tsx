'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Usuario } from '@/types'

type AuthContextType = {
  session: Session | null
  user: Usuario | null
  setUser: (user: Usuario | null) => void
  loadingUser: boolean
}

const AuthContext = createContext<AuthContextType>({ session: null, user: null, setUser: () => {}, loadingUser: true })


export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<Usuario | null>(null)
  const [loadingUser, setLoadingUser] = useState(true);

  // Recupera el usuario actual al cargar la app
  useEffect(() => {
    let cancelled = false
    let performedRecovery = false
    const init = async () => {
      try {
        console.log('[AuthProvider:init] Intento cargar usuario vía /api/login')
        const res = await fetch('/api/login')
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setUser(data)
            // Creamos una sesión sintética mínima sólo para marcar presencia
            setSession({} as Session)
            console.log('[AuthProvider:init] Usuario autenticado', data?.email)
          }
        } else {
          if (!cancelled) {
            setUser(null)
            setSession(null)
            console.warn('[AuthProvider:init] /api/login status', res.status)
            // Fallback: si existen cookies de supabase pero el registro usuarios se borró, limpiamos sesión llamando logout
            if (!performedRecovery) {
              performedRecovery = true
              try { await fetch('/api/logout', { method: 'POST' }) } catch {}
              // Redirigir a login sólo si no estamos ya allí para evitar loop
              if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                window.location.replace('/login')
              }
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[AuthProvider:init] error', e)
          setUser(null)
          setSession(null)
          if (!performedRecovery) {
            performedRecovery = true
            try { await fetch('/api/logout', { method: 'POST' }) } catch {}
            if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
              window.location.replace('/login')
            }
          }
        }
      } finally {
        if (!cancelled) setLoadingUser(false)
      }
    }
    init()
    // Ya no dependemos de eventos auth (cookies httpOnly manejadas en servidor)
    return () => { cancelled = true }
  }, [])

  // Wrapper para actualizar sólo el usuario (cookies controlan sesión real)
  const setUserWrapper = (u: Usuario | null) => {
    setUser(u)
    // Si establecemos usuario manualmente (login POST) y aún estamos en loadingUser, liberamos para permitir mostrar banner inmediatamente
    if (u && loadingUser) setLoadingUser(false)
  }

  return (
    <AuthContext.Provider value={{ session, user, setUser: setUserWrapper, loadingUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
