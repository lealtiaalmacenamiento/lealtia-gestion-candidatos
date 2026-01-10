// Hook: useNotificaciones
// Gestiona notificaciones en tiempo real con Supabase Realtime

'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/context/AuthProvider'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export interface Notificacion {
  id: number
  usuario_id: string
  tipo: 'pago_vencido' | 'pago_proximo' | 'comision_disponible' | 'sistema'
  titulo: string
  mensaje: string
  leida: boolean
  metadata: Record<string, unknown>
  created_at: string
  leida_at: string | null
}

export function useNotificaciones() {
  const { user, loadingUser } = useAuth()
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [loading, setLoading] = useState(true)

  const realtimeHabilitado = (() => {
    if (typeof window === 'undefined') return false
    const disableFlag = process.env.NEXT_PUBLIC_ENABLE_REALTIME_NOTIFS === 'false'
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    return !disableFlag && !isLocal
  })()

  const fetchNotificaciones = useCallback(async () => {
    if (!user?.id_auth) return

    try {
      setLoading(true)
      const res = await fetch(`/api/notificaciones?usuario_id=${user.id_auth}&limit=50`)
      const json = await res.json()

      if (res.ok) {
        setNotificaciones(json.notificaciones || [])
        setNoLeidas(json.no_leidas || 0)
      }
    } catch (error) {
      console.error('Error fetching notificaciones:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  const setupRealtimeSubscription = useCallback(async () => {
    if (!user?.id_auth || !realtimeHabilitado) return

    const channel = supabase
      .channel('notificaciones-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_id=eq.${user.id_auth}`
        },
        (payload: RealtimePostgresChangesPayload<Notificacion>) => {
          const newNotif = payload.new as Notificacion | null
          if (!newNotif) return
          setNotificaciones(prev => [newNotif, ...prev])
          setNoLeidas(prev => prev + 1)
          
          // Mostrar notificación del navegador (opcional)
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(newNotif.titulo, {
              body: newNotif.mensaje,
              icon: '/favicon.ico'
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_id=eq.${user.id_auth}`
        },
        (payload: RealtimePostgresChangesPayload<Notificacion>) => {
          const updated = payload.new as Notificacion | null
          if (!updated) return
          setNotificaciones(prev => prev.map(n => n.id === updated.id ? updated : n))
          if (updated.leida) {
            setNoLeidas(prev => Math.max(0, prev - 1))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [realtimeHabilitado, user])

  useEffect(() => {
    if (user?.id_auth && !loadingUser) {
      fetchNotificaciones()

      // Evitamos websocket en local; solo polling silencioso
      if (!realtimeHabilitado) {
        const interval = setInterval(fetchNotificaciones, 60_000)
        return () => clearInterval(interval)
      }

      const cleanupPromise = setupRealtimeSubscription()
      return () => {
        cleanupPromise?.then(fn => fn?.())
      }
    } else if (!loadingUser) {
      setLoading(false)
    }
  }, [user, loadingUser, fetchNotificaciones, setupRealtimeSubscription, realtimeHabilitado])

  const marcarComoLeida = async (id: number) => {
    try {
      const res = await fetch(`/api/notificaciones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leida: true })
      })

      if (res.ok) {
        setNotificaciones(prev => 
          prev.map(n => n.id === id ? { ...n, leida: true, leida_at: new Date().toISOString() } : n)
        )
        setNoLeidas(prev => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error('Error marcando notificación:', error)
    }
  }

  const marcarTodasLeidas = async () => {
    if (!user?.id_auth) return
    
    try {
      const res = await fetch('/api/notificaciones/marcar-todas-leidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: user.id_auth })
      })

      if (res.ok) {
        setNotificaciones(prev => 
          prev.map(n => ({ ...n, leida: true, leida_at: new Date().toISOString() }))
        )
        setNoLeidas(0)
      }
    } catch (error) {
      console.error('Error marcando todas leídas:', error)
    }
  }

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  }

  return {
    notificaciones,
    noLeidas,
    loading,
    marcarComoLeida,
    marcarTodasLeidas,
    refresh: fetchNotificaciones,
    requestNotificationPermission
  }
}
