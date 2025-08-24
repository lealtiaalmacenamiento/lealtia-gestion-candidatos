"use client";
import { useAuth } from '@/context/AuthProvider'
import { useState, useMemo } from 'react'
import { changePassword } from '@/lib/api'

export default function ForcePasswordChange() {
  const { user, setUser } = useAuth()
  const [open, setOpen] = useState(true)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const strength = useMemo(()=>{
    const v = pw1
    if(!v) return { label:'', pct:0, color:'bg-secondary' }
    let score = 0
    if(v.length>=8) score++
    if(/[A-Z]/.test(v)) score++
    if(/[a-z]/.test(v)) score++
    if(/\d/.test(v)) score++
    if(/[^A-Za-z0-9]/.test(v)) score++
    const pct = (score/5)*100
    const color = pct<40? 'bg-danger': pct<60? 'bg-warning': pct<80? 'bg-info':'bg-success'
    const label = pct<40? 'Débil': pct<60? 'Aceptable': pct<80? 'Fuerte':'Muy fuerte'
    return { label, pct, color }
  }, [pw1])
  if(!user?.must_change_password || !open) return null
  const submit = async (e: React.FormEvent)=>{
    e.preventDefault()
    if(pw1!==pw2) { setMsg('Las contraseñas no coinciden'); return }
    setLoading(true); setMsg(null)
    try { await changePassword(pw1); setMsg('Contraseña actualizada'); setUser({ ...user, must_change_password: false }); setTimeout(()=>setOpen(false), 1200) }
    catch(e){ setMsg(e instanceof Error? e.message:'Error'); }
    finally{ setLoading(false) }
  }
  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{background:'rgba(0,0,0,0.55)', zIndex:1050}}>
      <div className="card shadow-lg" style={{maxWidth:520, width:'100%'}}>
        <div className="card-header bg-warning fw-semibold">Cambio de contraseña requerido</div>
        <div className="card-body">
          <p className="mb-3 small text-muted">Tu cuenta tiene una contraseña temporal. Debes definir una nueva contraseña segura antes de continuar.</p>
          <form onSubmit={submit} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label small mb-1">Nueva contraseña</label>
              <input type="password" className="form-control" value={pw1} onChange={e=>setPw1(e.target.value)} required minLength={8} autoFocus />
            </div>
            <div>
              <label className="form-label small mb-1">Repite la contraseña</label>
              <input type="password" className="form-control" value={pw2} onChange={e=>setPw2(e.target.value)} required minLength={8} />
            </div>
            <div>
              <div className="progress" style={{height:6}}>
                <div className={`progress-bar ${strength.color}`} role="progressbar" style={{width: strength.pct+'%'}} aria-valuenow={strength.pct} aria-valuemin={0} aria-valuemax={100}></div>
              </div>
              {strength.label && <div className="small text-muted mt-1">Fortaleza: {strength.label}</div>}
            </div>
            {msg && <div className={`small ${msg.startsWith('Contraseña')? 'text-success':'text-danger'}`}>{msg}</div>}
            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-primary" disabled={loading}>{loading? 'Guardando...':'Guardar contraseña'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
