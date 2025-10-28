'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createUsuario } from '@/lib/api'
import type { Usuario } from '@/types'
import Notification from '@/components/ui/Notification'

const ROLES: { value: string; label: string }[] = [
  { value: 'superusuario', label: 'Super Usuario' }
]

export default function NuevoUsuarioPage() {
  const router = useRouter()
  const [form, setForm] = useState<Partial<Usuario> & { generarPasswordTemporal: boolean }>({
    email: '',
    nombre: '',
    rol: 'superusuario',
    generarPasswordTemporal: true
  })
  const [notif, setNotif] = useState<{ msg: string; type: 'success'|'error' } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target
    const { name, value } = target
  setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setNotif(null)
    try {
      const { correoEnviado, correoError } = await createUsuario({ ...form, activo: true })
      const msg = correoEnviado
        ? 'Usuario creado. Correo de acceso enviado.'
        : `Usuario creado. Correo NO enviado${correoError ? `: ${correoError}` : ''}`
      setNotif({ msg, type: correoEnviado ? 'success' : 'error' })
      setTimeout(() => router.push('/usuarios'), 1600)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear usuario'
      setNotif({ msg: message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="d-flex justify-content-center align-items-start pt-4">
      <div className="card shadow-sm" style={{width: 340}}>
        <div className="card-header py-2 fw-semibold">Crear nuevo usuario</div>
        <div className="card-body py-3">
          {notif && <Notification message={notif.msg} type={notif.type} />}
          <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label small mb-1">Nombre completo</label>
              <input className="form-control form-control-sm" name="nombre" value={form.nombre || ''} onChange={handleChange} placeholder="Ej. Juan Pérez" />
            </div>
            <div>
              <label className="form-label small mb-1">Correo electrónico</label>
              <input className="form-control form-control-sm" type="email" name="email" value={form.email || ''} onChange={handleChange} required placeholder="usuario@dominio.com" />
            </div>
            <div>
              <label className="form-label small mb-1">Rol asignado</label>
              <input className="form-control form-control-sm" value={ROLES[0].label} disabled readOnly />
            </div>
            <input type="hidden" name="activo" value="true" />
            {/* Hidden flag to always generate password temporal */}
            <input type="hidden" name="generarPasswordTemporal" value={String(form.generarPasswordTemporal)} />
            <button type="submit" className="btn btn-success btn-sm w-100" disabled={loading}>{loading ? 'Creando...' : 'Crear usuario'}</button>
            <div className="text-center">
              <Link href="/usuarios" className="small text-decoration-none">Cancelar</Link>
            </div>
            <div className="small text-muted text-center" style={{marginTop: '-4px'}}>Se enviará una contraseña temporal al correo.</div>
          </form>
        </div>
      </div>
    </div>
  )
}
