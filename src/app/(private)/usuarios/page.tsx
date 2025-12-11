
'use client';

import { useEffect, useState } from 'react';
import { getUsuarios, deleteUsuario, resetPasswordUsuario } from '@/lib/api';
import BasePage from '@/components/BasePage';
import Link from 'next/link';
import { normalizeRole } from '@/lib/roles';

type Usuario = {
  id: number;
  email: string;
  nombre?: string;
  rol: string;
  activo: boolean;
  must_change_password?: boolean;
};

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [resetting, setResetting] = useState<string | null>(null);
  const [notif, setNotif] = useState<{msg:string; type:'success'|'error'}|null>(null);
  const [pendingReset, setPendingReset] = useState<Usuario | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [transferDialog, setTransferDialog] = useState<{ usuario: Usuario; transferTo: number | null; loading: boolean; error: string | null; stats: Record<string, number> | null } | null>(null)

  useEffect(() => { getUsuarios().then(setUsuarios); }, []);

  return (
    <BasePage title="Usuarios">
      <div className="d-flex justify-content-center align-items-center d-center-mobile min-vh-100 bg-light px-2 px-sm-3">
        <div className="card shadow w-100 app-shell-narrow border-0">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2 className="mb-0">Usuarios</h2>
              <Link href="/usuarios/nuevo" className="btn btn-success">Nuevo</Link>
            </div>
            {notif && <div className={`alert alert-${notif.type==='success'?'success':'danger'} py-2`}>{notif.msg}</div>}
            <div className="table-responsive small">
              <table className="table table-bordered table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Email</th>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Activo</th>
                    <th>Debe cambiar password</th>
                    <th className="col-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.length === 0 ? (
                    <tr><td colSpan={6} className="text-center">No hay usuarios registrados.</td></tr>
                  ) : usuarios.map(u => {
                    const normalizedRol = normalizeRole(u.rol);
                    const displayRol = normalizedRol ?? u.rol;
                    const protectedRole = normalizedRol === 'admin' || normalizedRol === 'supervisor';
                    return (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>{u.nombre || '—'}</td>
                      <td>{displayRol}</td>
                      <td>{u.activo ? 'Sí' : 'No'}</td>
                      <td>{u.must_change_password ? 'Sí' : 'No'}</td>
                      <td className="p-1">
                        <div className="d-flex flex-column flex-sm-row stack-actions gap-1">
                          <Link href={`/usuarios/${u.id}`} className="btn btn-primary btn-sm flex-fill">Editar</Link>
                          <button
                            onClick={async () => {
                              if (protectedRole || deletingId) return;
                              if (normalizedRol === 'agente') {
                                setNotif(null);
                                setTransferDialog({ usuario: u, transferTo: null, loading: false, error: null, stats: null })
                                return
                              }
                              setNotif(null);
                              setDeletingId(u.id);
                              const original = usuarios;
                              setUsuarios(prev => prev.filter(x => x.id !== u.id));
                              try {
                                await deleteUsuario(u.id);
                                setNotif({ msg: 'Usuario eliminado', type: 'success' });
                              } catch (e) {
                                setUsuarios(original);
                                const msg = e instanceof Error ? e.message : 'Error al eliminar';
                                setNotif({ msg, type: 'error' });
                              } finally {
                                setDeletingId(null);
                              }
                            }}
                            className="btn btn-danger btn-sm flex-fill d-flex align-items-center justify-content-center gap-1"
                            disabled={protectedRole || (!!deletingId && deletingId!==u.id)}
                            title={protectedRole ? 'No se puede eliminar usuarios admin o supervisor' : ''}
                          >
                            {deletingId === u.id && <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>}
                            {deletingId === u.id ? 'Eliminando...' : 'Eliminar'}
                          </button>
                          <button
                            onClick={()=>setPendingReset(u)}
                            className="btn btn-warning btn-sm flex-fill"
                            disabled={resetting===u.email}
                          >{resetting===u.email?'...':'Reset'}</button>
                        </div>
                      </td>
                    </tr>
                    )})}
                </tbody>
              </table>
            </div>
            {pendingReset && (
              <ResetPasswordModal
                usuario={pendingReset}
                onClose={()=>{ if(!resetting) { setPendingReset(null); setResetMsg(null) } }}
                onConfirm={async()=>{
                  if(!pendingReset) return;
                  setResetting(pendingReset.email); setNotif(null); setResetMsg(null)
                  try {
                    await resetPasswordUsuario(pendingReset.email);
                    setResetMsg('Contraseña temporal generada. Se intentó enviar el correo.');
                    setNotif({msg:'Password reseteado', type:'success'});
                    // Cerrar automático tras breve pausa
                    setTimeout(()=>{ setPendingReset(null); setResetMsg(null); }, 1200)
                  } catch(e) {
                    const msg = e instanceof Error? e.message:'Error al resetear'
                    setResetMsg(msg)
                    setNotif({msg, type:'error'})
                  } finally {
                    setResetting(null)
                  }
                }}
                loading={!!resetting}
                message={resetMsg}
              />
            )}
          </div>
        </div>
      </div>
      {transferDialog && (
        <TransferAgenteModal
          usuarios={usuarios}
          dialog={transferDialog}
          onDismiss={() => { if (!transferDialog.loading) setTransferDialog(null) }}
          onChange={(transferTo) => setTransferDialog(prev => prev ? { ...prev, transferTo, error: null } : prev)}
          onConfirm={async () => {
            if (!transferDialog.transferTo) {
              setTransferDialog(prev => prev ? { ...prev, error: 'Selecciona un agente destino' } : prev)
              return
            }
            setTransferDialog(prev => prev ? { ...prev, loading: true, error: null } : prev)
            try {
              const res = await deleteUsuario(transferDialog.usuario.id, { transferTo: transferDialog.transferTo })
              setUsuarios(prev => prev.filter(x => x.id !== transferDialog.usuario.id))
              setNotif({ msg: 'Agente eliminado y registros transferidos', type: 'success' })
              setTransferDialog(prev => prev ? { ...prev, loading: false, stats: res.stats || null } : prev)
              setTimeout(() => setTransferDialog(null), 1600)
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Error al transferir y eliminar'
              setTransferDialog(prev => prev ? { ...prev, loading: false, error: msg } : prev)
            }
          }}
        />
      )}
    </BasePage>
  );
}

type ResetModalProps = { usuario: Usuario; onClose: ()=>void; onConfirm: ()=>void; loading: boolean; message: string | null }
function ResetPasswordModal({ usuario, onClose, onConfirm, loading, message }: ResetModalProps) {
  useEffect(()=>{ const prev = document.body.style.overflow; document.body.style.overflow='hidden'; return ()=>{ document.body.style.overflow=prev } }, [])
  const isError = !!message && message.toLowerCase().includes('error')
  return (
    <div className="app-modal" role="dialog" aria-modal="true" aria-labelledby="resetPwdTitle">
      <div className="app-modal-content" data-testid="reset-modal">
        <div className="app-modal-header">
          <span className="d-inline-flex align-items-center justify-content-center bg-white text-primary rounded-circle" style={{width:32,height:32}}>
            <i className="bi bi-shield-lock-fill"></i>
          </span>
          <h6 id="resetPwdTitle">Reset password</h6>
          <button className="app-modal-close" aria-label="Cerrar" onClick={onClose} disabled={loading}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="app-modal-body">
          <p className="mb-2">Se generará una contraseña temporal y se enviará (si el email está configurado) al usuario:</p>
          <div className="app-badge-mail mb-3"><i className="bi bi-envelope-fill"></i><span className="text-break">{usuario.email}</span></div>
          {!message && <p className="text-danger mb-0 fw-semibold">¿Confirmas el reset?</p>}
          {message && (
            <div className={`app-status-msg ${isError? 'error':'success'} d-flex align-items-center gap-2`}>
              <i className={`bi ${isError? 'bi-exclamation-triangle-fill':'bi-check-circle-fill'}`}></i>
              <span>{message}</span>
            </div>
          )}
        </div>
        <div className="app-modal-footer">
          <button className="btn btn-soft-secondary btn-sm" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn-soft-warning btn-sm d-flex align-items-center gap-2 fw-semibold" onClick={onConfirm} disabled={loading || !!message}>
            {loading && <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>}
            {loading? 'Procesando...':'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

type TransferModalProps = {
  usuarios: Usuario[]
  dialog: { usuario: Usuario; transferTo: number | null; loading: boolean; error: string | null; stats: Record<string, number> | null }
  onDismiss: () => void
  onChange: (transferTo: number | null) => void
  onConfirm: () => void
}

function TransferAgenteModal({ usuarios, dialog, onDismiss, onChange, onConfirm }: TransferModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const opciones = usuarios.filter(u => u.rol === 'agente' && u.activo && u.id !== dialog.usuario.id)

  return (
    <div className="app-modal" role="dialog" aria-modal="true" aria-labelledby="transferAgenteTitle">
      <div className="app-modal-content" data-testid="transfer-modal">
        <div className="app-modal-header">
          <span className="d-inline-flex align-items-center justify-content-center bg-white text-primary rounded-circle" style={{ width: 32, height: 32 }}>
            <i className="bi bi-arrow-left-right"></i>
          </span>
          <h6 id="transferAgenteTitle" className="mb-0">Reasignar registros</h6>
          <button className="app-modal-close" aria-label="Cerrar" onClick={onDismiss} disabled={dialog.loading}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="app-modal-body">
          <p className="mb-3">Antes de eliminar al agente <strong>{dialog.usuario.email}</strong>, selecciona un agente activo que recibirá sus prospectos, citas y clientes asignados.</p>
          <label className="form-label">Reasignar a</label>
          <select
            className="form-select"
            value={dialog.transferTo ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            disabled={dialog.loading}
          >
            <option value="">Selecciona un agente…</option>
            {opciones.map(o => (
              <option key={o.id} value={o.id}>{o.email}</option>
            ))}
          </select>
          {dialog.error && <div className="alert alert-danger py-2 mt-3">{dialog.error}</div>}
          {dialog.stats && (
            <div className="alert alert-success py-2 mt-3">
              <p className="mb-1 fw-semibold">Registros transferidos:</p>
              <ul className="mb-0 ps-3">
                {Object.entries(dialog.stats).map(([key, value]) => (
                  <li key={key}><span className="text-capitalize">{key}</span>: {value}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="app-modal-footer">
          <button className="btn btn-soft-secondary btn-sm" onClick={onDismiss} disabled={dialog.loading || !!dialog.stats}>Cancelar</button>
          <button className="btn btn-danger btn-sm d-flex align-items-center gap-2" onClick={onConfirm} disabled={dialog.loading || !!dialog.stats}>
            {dialog.loading && <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>}
            {dialog.loading ? 'Reasignando…' : 'Confirmar eliminación'}
          </button>
        </div>
      </div>
    </div>
  )
}
