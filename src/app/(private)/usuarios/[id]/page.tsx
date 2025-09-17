'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { getUsuarioById, updateUsuario, deleteUsuario, resetPasswordUsuario } from '@/lib/api'
import AppModal from '@/components/ui/AppModal'
import Notification from '@/components/ui/Notification'
import type { Usuario } from '@/types'
import { useDialog } from '@/components/ui/DialogProvider'

const ROLES = [
  { value: 'editor', label: 'Editor' },
  { value: 'superusuario', label: 'Super Usuario' },
  { value: 'lector', label: 'Viewer' }
]

export default function UsuarioEditPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const dialog = useDialog()
  const [form, setForm] = useState<Partial<Usuario>>({})
  const [resetting, setResetting] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [notif, setNotif] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    getUsuarioById(Number(params.id))
      .then(setForm)
      .catch(err => setNotif({ msg: err.message, type: 'error' }))
  }, [params.id])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target
    const { name, value } = target
    const isCheckbox = (target as HTMLInputElement).type === 'checkbox'
    const checked = isCheckbox ? (target as HTMLInputElement).checked : undefined
    setForm(prev => ({ ...prev, [name]: isCheckbox ? checked : value }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.id) return
    try {
      await updateUsuario(form.id, { nombre: form.nombre, rol: form.rol!, activo: form.activo! })
      router.push('/usuarios')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar'
      setNotif({ msg: message, type: 'error' })
    }
  }

  const handleDelete = async () => {
    const ok = await dialog.confirm('¿Eliminar este usuario?', { icon: 'exclamation-triangle-fill', confirmText: 'Eliminar', cancelText: 'Cancelar' })
    if (!ok) return
    try {
      await deleteUsuario(Number(params.id))
      router.push('/usuarios')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar'
      setNotif({ msg: message, type: 'error' })
    }
  }

  const confirmReset = async () => {
    if(!form.email) return
    setResetting(true)
    setNotif(null)
    try {
      await resetPasswordUsuario(form.email)
      setNotif({ msg: 'Password temporal generado y enviado (si es posible).', type: 'success' })
    } catch (e) {
      setNotif({ msg: e instanceof Error? e.message:'Error al resetear', type:'error' })
    } finally {
      setResetting(false)
      setShowResetModal(false)
    }
  }

  if (!form.email) return <div>Cargando...</div>

  return (
    <div className="d-flex justify-content-center align-items-start pt-4">
      <div className="card shadow-sm" style={{width:340}}>
        <div className="card-header py-2 fw-semibold">Editar usuario</div>
        <div className="card-body py-3">
          {notif && <Notification message={notif.msg} type={notif.type} />}
          <form onSubmit={handleSave} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label small mb-1">Correo electrónico</label>
              <input className="form-control form-control-sm" value={form.email || ''} disabled />
            </div>
            <div>
              <label className="form-label small mb-1">Nombre completo</label>
              <input className="form-control form-control-sm" name="nombre" value={form.nombre || ''} onChange={handleChange} />
            </div>
            <div>
              <label className="form-label small mb-1">Rol</label>
              <select className="form-select form-select-sm" name="rol" value={form.rol || ''} onChange={handleChange}>
                {/* Si el usuario actual es admin, mostrar opción admin */}
                {form.rol === 'admin' && <option value="admin">Admin</option>}
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="form-check form-switch small">
              <input className="form-check-input" type="checkbox" name="activo" id="activoChk" checked={form.activo || false} onChange={handleChange} />
              <label className="form-check-label" htmlFor="activoChk">Activo</label>
            </div>
            <div className="small">Debe cambiar password: <strong>{form.must_change_password? 'Sí':'No'}</strong></div>
            <div className="d-flex flex-column gap-2">
              <button type="submit" className="btn btn-primary btn-sm w-100">Guardar cambios</button>
              <button type="button" className="btn btn-warning btn-sm w-100" onClick={()=>setShowResetModal(true)} disabled={resetting}>Reset password</button>
              <button type="button" className="btn btn-danger btn-sm w-100" onClick={handleDelete}>Eliminar</button>
              <Link href="/usuarios" className="btn btn-secondary btn-sm w-100">Volver</Link>
            </div>
          </form>
        </div>
      </div>
      {showResetModal && (
        <AppModal
          title="Reset password"
            icon="shield-lock-fill"
            width={420}
            disableClose={resetting}
            onClose={()=> !resetting && setShowResetModal(false)}
            footer={<>
              <button className="btn btn-soft-secondary btn-sm" onClick={()=>setShowResetModal(false)} disabled={resetting}>Cancelar</button>
              <button className="btn btn-soft-warning btn-sm" onClick={confirmReset} disabled={resetting}>
                {resetting? <span className="spinner-border spinner-border-sm" />:'Confirmar'}
              </button>
            </>}
        >
          <p className="mb-2">Generar nueva contraseña temporal para:</p>
          <div className="app-badge-mail mb-3"><i className="bi bi-envelope-fill"></i><span>{form.email}</span></div>
          <p className="text-danger fw-semibold mb-0">¿Continuar?</p>
        </AppModal>
      )}
    </div>
  )
}
