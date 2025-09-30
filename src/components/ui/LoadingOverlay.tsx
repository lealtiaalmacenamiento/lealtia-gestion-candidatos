import React from 'react'

interface Props { show:boolean; text?:string }

export const LoadingOverlay: React.FC<Props> = ({ show, text }) => {
  if(!show) return null
  return (
    <div className="loading-overlay d-flex flex-column justify-content-center align-items-center">
      <div className="spinner-border text-primary mb-2" role="status" aria-label="Cargando" />
      {text && <div className="small text-light fw-semibold text-center px-3">{text}</div>}
    </div>
  )
}

export default LoadingOverlay
