"use client";
import { useEffect } from 'react'
import React from 'react'

export interface AppModalProps {
  title: string
  icon?: string // bootstrap icon name without prefix
  children: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
  width?: number
  disableClose?: boolean
  role?: string
}

export function AppModal({ title, icon='info-circle-fill', children, footer, onClose, width=520, disableClose=false, role='dialog' }: AppModalProps) {
  useEffect(()=>{ const prev = document.body.style.overflow; document.body.style.overflow='hidden'; return ()=>{ document.body.style.overflow=prev } }, [])
  return (
    <div className="app-modal" role={role} aria-modal="true" aria-labelledby="appModalTitle">
      <div className="app-modal-content" style={{maxWidth:width}}>
        <div className="app-modal-header">
          <span className="d-inline-flex align-items-center justify-content-center bg-white text-primary rounded-circle" style={{width:32,height:32}}>
            <i className={`bi bi-${icon}`}></i>
          </span>
          <h6 id="appModalTitle">{title}</h6>
          <button className="app-modal-close" aria-label="Cerrar" onClick={()=>!disableClose && onClose()} disabled={disableClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="app-modal-body">
          {children}
        </div>
        {footer && (
          <div className="app-modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export default AppModal