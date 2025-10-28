"use client";
import Header from '@/components/Header'
import { useAuth } from '@/context/AuthProvider'
import FullScreenLoader from '@/components/ui/FullScreenLoader'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { logPageView, logClick, logFormSubmit } from '@/lib/auditClient'
// (imports de hooks/logic eliminados tras extraer el componente de cambio de contraseña)
import ForcePasswordChange from '@/components/ForcePasswordChange'
import SessionTimeoutPrompt from '@/components/SessionTimeoutPrompt'


// Eliminado banner inline; ahora se usa componente reutilizable

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  const { user, loadingUser } = useAuth()
  const mustChange = user?.must_change_password
  const pathname = usePathname();

  // Auditoría UI: page views
  useEffect(() => {
    if (!loadingUser && user && pathname) {
      logPageView(pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, loadingUser])

  // Auditoría UI: clicks y submits globales
  useEffect(() => {
    if (loadingUser || !user) return
    const onClick = (ev: MouseEvent) => {
      try {
        const target = ev.target as HTMLElement | null
        if (!target) return
        // Subir metadatos básicos sin PII adicional
        const meta: Record<string, unknown> = {
          tag: target.tagName,
          id: target.id || undefined,
          cls: target.className || undefined,
          role: (target.getAttribute && target.getAttribute('role')) || undefined,
          name: (target.getAttribute && target.getAttribute('name')) || undefined,
          path: pathname
        }
        // Evitar loguear cada click del documento si no es interactivo
        const interactive = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
        if (!interactive && !(target as HTMLElement).closest('button, a, input, select, textarea')) return
        logClick(meta)
      } catch {}
    }
    const onSubmit = (ev: Event) => {
      try {
        const form = ev.target as HTMLFormElement | null
        if (!form) return
        const meta: Record<string, unknown> = {
          id: form.id || undefined,
          cls: form.className || undefined,
          action: form.action || undefined,
          method: form.method || undefined,
          path: pathname
        }
        logFormSubmit(meta)
      } catch {}
    }
    const opts: AddEventListenerOptions = { capture: true }
    document.addEventListener('click', onClick, opts)
    document.addEventListener('submit', onSubmit, opts)
    return () => {
      document.removeEventListener('click', onClick, opts)
      document.removeEventListener('submit', onSubmit, opts)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingUser, user?.email])

  // Bloquear hasta conocer el usuario para evitar mostrar dashboard fugazmente
  if (loadingUser) return <FullScreenLoader text="Cargando sesión..." />

  const hideGlobalHeader = pathname === '/home' || pathname === '/dashboard';

  return (
    <div>
      {!hideGlobalHeader && <Header />}
      <ForcePasswordChange />
      <SessionTimeoutPrompt />
      <main className="main-content">
        {mustChange ? (
          <div className="container py-4">
            <div className="alert alert-info mb-0">Debes completar el cambio de contraseña para acceder al contenido.</div>
          </div>
        ) : children}
      </main>
    </div>
  )
}
