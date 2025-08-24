'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthProvider'
import Notification from './ui/Notification'
import type { Usuario } from '@/types'

declare global {
  interface Window { authDebug?: unknown }
}

export default function LoginForm() {
  const { setUser } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (typeof window !== 'undefined') window.authDebug = {}

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
  setError(null)
  setLoading(true)

    try {
      // Sign in en el cliente: esto crea las cookies estándar que detecta middleware y getSession
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      if (!res.ok) {
        if (res.status === 401) setError('Credenciales inválidas')
        else setError('Error al iniciar sesión (' + res.status + ')')
        return
      }
      const usuario: Usuario = await res.json()
      setUser(usuario)
      if (typeof window !== 'undefined') window.authDebug = { usuario }
  router.replace('/home')
  } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      {error && <Notification message={error} type="error" />}
      <div className="mb-3">
        <label className="form-label">Email</label>
        <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} required placeholder="Correo electrónico" />
      </div>
      <div className="mb-3">
        <label className="form-label">Contraseña</label>
        <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Contraseña" />
      </div>
      <button type="submit" className="btn btn-primary w-100 fw-bold d-flex justify-content-center align-items-center" style={{ background: '#0a2c3d', opacity: loading ? 0.8 : 1 }} disabled={loading}>
        {loading && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>}
        {loading ? 'Ingresando...' : 'Ingresar'}
      </button>
    </form>
  )
}
