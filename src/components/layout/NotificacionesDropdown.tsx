// Componente: Dropdown de notificaciones en navbar
'use client'

import { useNotificaciones } from '@/hooks/useNotificaciones'
import { useEffect, useRef, useState } from 'react'

export default function NotificacionesDropdown() {
  const { 
    notificaciones, 
    noLeidas, 
    loading, 
    marcarComoLeida, 
    marcarTodasLeidas,
    requestNotificationPermission 
  } = useNotificaciones()
  
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  // Solicitar permisos de notificaciones del navegador
  useEffect(() => {
    requestNotificationPermission()
  }, [requestNotificationPermission])

  const getIcono = (tipo: string) => {
    switch (tipo) {
      case 'pago_vencido':
        return '💸'
      case 'pago_proximo':
        return '⏰'
      case 'comision_disponible':
        return '💰'
      case 'sistema':
        return 'ℹ️'
      default:
        return '🔔'
    }
  }

  const getTimeAgo = (fecha: string) => {
    const now = new Date()
    const past = new Date(fecha)
    const diffMs = now.getTime() - past.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Ahora'
    if (diffMins < 60) return `Hace ${diffMins}m`
    if (diffHours < 24) return `Hace ${diffHours}h`
    return `Hace ${diffDays}d`
  }

  const notificacionesRecientes = notificaciones.slice(0, 5)

  return (
    <div className="position-relative" ref={dropdownRef}>
      {/* Botón de notificaciones */}
      <button
        type="button"
        className="btn btn-link position-relative p-2"
        onClick={() => setShowDropdown(!showDropdown)}
        aria-label="Notificaciones"
      >
        <i className="bi bi-bell fs-5"></i>
        {noLeidas > 0 && (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div 
          className="dropdown-menu dropdown-menu-end show position-absolute"
          style={{ 
            width: '360px', 
            maxHeight: '500px',
            overflowY: 'auto',
            top: '100%',
            right: 0,
            zIndex: 1050
          }}
        >
          {/* Header */}
          <div className="dropdown-header d-flex justify-content-between align-items-center">
            <span className="fw-bold">Notificaciones</span>
            {noLeidas > 0 && (
              <button
                className="btn btn-link btn-sm p-0 text-decoration-none"
                onClick={marcarTodasLeidas}
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="dropdown-divider"></div>

          {/* Lista de notificaciones */}
          {loading ? (
            <div className="text-center py-4">
              <div className="spinner-border spinner-border-sm" role="status">
                <span className="visually-hidden">Cargando...</span>
              </div>
            </div>
          ) : notificacionesRecientes.length === 0 ? (
            <div className="text-center text-muted py-4">
              <i className="bi bi-bell-slash fs-1"></i>
              <p className="mt-2 mb-0">No tienes notificaciones</p>
            </div>
          ) : (
            notificacionesRecientes.map((notif) => (
              <div
                key={notif.id}
                className={`dropdown-item ${!notif.leida ? 'bg-light' : ''}`}
                style={{ cursor: 'pointer', whiteSpace: 'normal' }}
                onClick={() => {
                  if (!notif.leida) marcarComoLeida(notif.id)
                  setShowDropdown(false)
                }}
              >
                <div className="d-flex align-items-start">
                  <span className="me-2 fs-4">{getIcono(notif.tipo)}</span>
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-start">
                      <strong className="d-block mb-1">{notif.titulo}</strong>
                      <small className="text-muted">{getTimeAgo(notif.created_at)}</small>
                    </div>
                    <p className="mb-0 small text-muted">{notif.mensaje}</p>
                    {!notif.leida && (
                      <span className="badge bg-primary mt-1">Nueva</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

        </div>
      )}
    </div>
  )
}
