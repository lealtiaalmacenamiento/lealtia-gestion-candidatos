import React, { useState, useEffect } from 'react'

interface NavbarProps {
  brand?: string
  pageTitle?: string
  children?: React.ReactNode
  sticky?: boolean
}

export default function Navbar({ brand = 'Lealtia', pageTitle, children, sticky = true }: NavbarProps) {
  const [open, setOpen] = useState(false)

  // Cerrar al cambiar tamaño (si vuelve a desktop)
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 992 && open) setOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  return (
    <nav className={`app-navbar bg-gradient-to-r from-[#072e40] to-[#09384d] text-white ${sticky ? 'sticky top-0' : ''} z-50 shadow-sm border-b border-white/10 backdrop-blur`}>
      <div className="container d-flex align-items-center gap-3 py-2 px-3 px-md-4 flex-wrap">
        <div className="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
          <button
            className="navbar-toggle d-lg-none btn btn-sm p-2 d-inline-flex align-items-center justify-content-center"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            aria-controls="app-nav-collapse"
            onClick={() => setOpen(o => !o)}
            type="button"
          >
            <i className={`bi ${open ? 'bi-x-lg' : 'bi-list'} fs-5`}></i>
          </button>
          <span className="navbar-brand fs-5 fw-bold mb-0 user-select-none text-truncate" style={{ letterSpacing: '.5px' }}>{brand}</span>
          {pageTitle && (
            <span className="d-none d-sm-inline text-truncate fw-semibold opacity-90" title={pageTitle}>{pageTitle}</span>
          )}
        </div>
        {/* Desktop inline */}
        <div className="d-none d-lg-flex align-items-center gap-2 flex-wrap">
          {children}
        </div>
        {/* Mobile collapse */}
        <div
          id="app-nav-collapse"
          className={`nav-collapse w-100 d-lg-none ${open ? 'show' : ''}`}
          aria-hidden={!open}
        >
          <div className="pt-2 d-flex flex-column gap-2 border-top border-white/25 mt-2">
            {children || <span className="small text-white-50">Sin opciones</span>}
          </div>
        </div>
      </div>
    </nav>
  )
}
