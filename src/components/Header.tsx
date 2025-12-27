'use client'

import Navbar from './Navbar'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthProvider'
import { usePageTitle } from '@/context/PageTitleContext'
import Link from 'next/link'
import NotificacionesDropdown from './layout/NotificacionesDropdown'

export default function Header() {
  const { user } = useAuth()
  const router = useRouter()

  const pathname = usePathname()
  const onDashboard = pathname === '/home'
  const goDashboard = () => {
  if (!onDashboard) router.push('/home')
  }

  const { title } = usePageTitle()
  // Navegación contextual por módulo
  // (Se removió navegación contextual, rol ya no utilizado)
  const moduleLinks: { href: string; label: string; icon?: string; roles?: string[] }[] = []
  // Eliminamos prospectos/planificación del navbar; se mostrarán solo en el dashboard principal.

  return (
    <Navbar pageTitle={title && title.toLowerCase() !== 'dashboard' ? title : undefined}>
      {user && (
        <>
          {/* Grupo de badges usuario/rol */}
          <div className="d-flex flex-wrap align-items-center gap-2 user-meta-group">
            <NotificacionesDropdown />
            <span
              className="inline-flex align-items-center gap-2 bg-white text-[#072e40] px-3 py-1 rounded-pill small fw-semibold shadow-sm border border-white/60"
              title={`Usuario: ${user.email}`}
            >
              <i className="bi bi-person-fill text-[#072e40]"></i>
              {user.email}
            </span>
            <span
              className="inline-flex align-items-center gap-2 bg-white text-[#072e40] px-3 py-1 rounded-pill small fw-semibold shadow-sm border border-white/60"
              title={`Rol: ${user.rol}`}
            >
              <i className="bi bi-shield-lock-fill text-[#072e40]"></i>
              {user.rol}
            </span>
            <button
              onClick={goDashboard}
              disabled={onDashboard}
              className="border border-white/80 text-white px-4 py-1 rounded-pill hover:bg-white hover:text-[#072e40] transition small fw-medium disabled:opacity-40 disabled:cursor-default"
              title={onDashboard ? 'Ya estás en el dashboard' : 'Ir al dashboard'}
              type="button"
            >
              {onDashboard ? 'Dashboard' : 'Dashboard'}
            </button>
          </div>
          {/* Navegación contextual */}
          {moduleLinks.length > 0 && (
            <div className="module-nav d-flex flex-wrap align-items-center gap-1">
              {moduleLinks.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={
                    'module-nav-link small px-3 py-1 rounded-pill d-inline-flex align-items-center gap-1 ' +
                    (pathname === l.href ? 'active' : '')
                  }
                >
                  {l.icon && <i className={`bi bi-${l.icon}`}></i>}
                  <span>{l.label}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </Navbar>
  )
}

