import Image from 'next/image'
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
          <h2 className="mt-2">Bienvenido</h2>
          <p className="text-muted">Ingresa tus credenciales para acceder</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
