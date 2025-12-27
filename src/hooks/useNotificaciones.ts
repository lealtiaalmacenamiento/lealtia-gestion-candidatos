// Hook: useNotificaciones
// Gestiona notificaciones en tiempo real con Supabase Realtime

'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface Notificacion {
  id: number
  usuario_id: string
  tipo: 'pago_vencido' | 'pago_proximo' | 'comision_disponible' | 'sistema'
  titulo: string
  mensaje: string
  leida: boolean
  metadata: Record<string, any>
  created_at: string
  leida_at: string | null
}

export function useNotificaciones() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchNotificaciones()
    setupRealtimeSubscription()
  }, [])

  const fetchNotificaciones = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/notificaciones?limit=50')
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
  }

  const setupRealtimeSubscription = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) return

    const channel = supabase
      .channel('notificaciones-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_id=eq.${user.id}`
        },
        (payload: any) => {
          const newNotif = payload.new as Notificacion
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
          filter: `usuario_id=eq.${user.id}`
        },
        (payload: any) => {
          const updated = payload.new as Notificacion
          setNotificaciones(prev => 
            prev.map(n => n.id === updated.id ? updated : n)
          )
          if (updated.leida) {
            setNoLeidas(prev => Math.max(0, prev - 1))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

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
    try {
      const res = await fetch('/api/notificaciones/marcar-todas-leidas', {
        method: 'POST'
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
