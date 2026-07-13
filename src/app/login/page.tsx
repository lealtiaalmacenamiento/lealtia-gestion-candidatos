import Image from 'next/image'
import Link from 'next/link'
import LoginForm from '@/components/LoginForm'
// import BasePage from '@/components/BasePage';

export default function LoginPage() {
  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100 bg-light px-3">
      <div className="card shadow p-4 app-auth-card border-0">
        <div className="text-center mb-4">
          <div className="ratio ratio-1x1 mx-auto" style={{ maxWidth: 160 }}>
            <Image
              src="https://lh3.googleusercontent.com/d/1GJjIRwWcv-g3u8dTykyxlzP2pviTLB6w"
              alt="Logo"
              fill
              sizes="(max-width: 576px) 96px, 160px"
              style={{ objectFit: 'contain' }}
              priority
            />
          </div>
          <h2 className="mt-2">Portal de asesores Lealtia</h2>
          <p className="text-muted mb-2">Ingresa tus credenciales para acceder</p>
          <p className="small text-muted mb-0">
            Acceso autorizado para asesores y equipo operativo de Lealtia. Desde este portal se
            gestionan citas, seguimiento de prospectos y sincronizacion de agenda con Google
            Calendar cuando el usuario lo autoriza.
          </p>
        </div>
        <LoginForm />
        <div className="text-center small text-muted mt-4">
          Al acceder aceptas los{' '}
          <Link href="/terminos-servicio">Terminos de Servicio</Link>
          {' '}y la{' '}
          <Link href="/politica-privacidad">Politica de Privacidad</Link>.
        </div>
      </div>
    </div>
  );
}
