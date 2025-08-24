"use client";
import Header from '@/components/Header'
import { useAuth } from '@/context/AuthProvider'
import FullScreenLoader from '@/components/ui/FullScreenLoader'
import { usePathname } from 'next/navigation'
// (imports de hooks/logic eliminados tras extraer el componente de cambio de contraseña)
import ForcePasswordChange from '@/components/ForcePasswordChange'


// Eliminado banner inline; ahora se usa componente reutilizable

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  const { user, loadingUser } = useAuth()
  const mustChange = user?.must_change_password
  const pathname = usePathname();

  // Bloquear hasta conocer el usuario para evitar mostrar dashboard fugazmente
  if (loadingUser) return <FullScreenLoader text="Cargando sesión..." />

  const hideGlobalHeader = pathname === '/home' || pathname === '/dashboard';

  return (
    <div>
      {!hideGlobalHeader && <Header />}
      <ForcePasswordChange />
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
