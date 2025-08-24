
'use client';

import { useEffect, useState } from 'react';
import { getUsuarios, deleteUsuario, resetPasswordUsuario } from '@/lib/api';
import BasePage from '@/components/BasePage';
import Link from 'next/link';

type Usuario = {
  id: number;
  email: string;
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
                    <th>Rol</th>
                    <th>Activo</th>
                    <th>Debe cambiar password</th>
                    <th className="col-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.length === 0 ? (
                    <tr><td colSpan={5} className="text-center">No hay usuarios registrados.</td></tr>
                  ) : usuarios.map(u => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>{u.rol}</td>
                      <td>{u.activo ? 'Sí' : 'No'}</td>
                      <td>{u.must_change_password ? 'Sí' : 'No'}</td>
                      <td className="p-1">
                        <div className="d-flex flex-column flex-sm-row stack-actions gap-1">
                          <Link href={`/usuarios/${u.id}`} className="btn btn-primary btn-sm flex-fill">Editar</Link>
                          <button
                            onClick={async () => {
                              if (u.rol === 'admin' || u.rol === 'superusuario' || deletingId) return;
                              setNotif(null);
                              setDeletingId(u.id);
                              const original = usuarios;
                              // Optimistic remove
                              setUsuarios(prev => prev.filter(x => x.id !== u.id));
                              try {
                                await deleteUsuario(u.id);
                                setNotif({ msg: 'Usuario eliminado', type: 'success' });
                              } catch (e) {
                                setUsuarios(original); // rollback
                                const msg = e instanceof Error ? e.message : 'Error al eliminar';
                                setNotif({ msg, type: 'error' });
                              } finally {
                                setDeletingId(null);
                              }
                            }}
                            className="btn btn-danger btn-sm flex-fill d-flex align-items-center justify-content-center gap-1"
                            disabled={u.rol === 'admin' || u.rol === 'superusuario' || (!!deletingId && deletingId!==u.id)}
                            title={(u.rol === 'admin' || u.rol === 'superusuario') ? 'No se puede eliminar usuarios admin o superusuario' : ''}
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
                  ))}
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
