'use client';
import { useEffect, useState } from 'react';

import { getCandidatos, deleteCandidato } from '@/lib/api';
import AppModal from '@/components/ui/AppModal';
import type { Candidato } from '@/types';
import BasePage from '@/components/BasePage';
import Link from 'next/link';

export default function CandidatosPage() {
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [notif, setNotif] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Candidato | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getCandidatos().then(setCandidatos).catch(err => setNotif(err.message));
  }, []);

  const performDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteCandidato(pendingDelete.id_candidato);
      setCandidatos(prev => prev.filter(c => c.id_candidato !== pendingDelete.id_candidato));
      setNotif(`Candidato #${pendingDelete.id_candidato} eliminado`);
    } catch (err) {
      setNotif(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  return (
    <BasePage title="Candidatos" alert={notif ? { type: 'info', message: notif, show: true } : undefined}>
      <div className="d-flex justify-content-center align-items-center d-center-mobile min-vh-100 bg-light px-2 px-sm-3">
        <div className="card shadow w-100 app-shell-narrow border-0">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2 className="mb-0">Candidatos</h2>
              <Link href="/candidatos/nuevo" className="btn btn-success">Nuevo</Link>
            </div>
            <div className="table-responsive small">
              <table className="table table-bordered table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>CT</th>
                    <th>Nombre</th>
                    <th>MES</th>
                    <th>EFC</th>
                    <th className="col-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {candidatos.length === 0 ? (
                    <tr><td colSpan={5} className="text-center">No hay candidatos registrados.</td></tr>
                  ) : candidatos.map((c) => (
                    <tr key={c.id_candidato}>
                      <td>{c.ct}</td>
                      <td>{c.candidato}</td>
                      <td>{c.mes}</td>
                      <td>{c.efc}</td>
                      <td className="p-1">
                        <div className="d-flex flex-column flex-sm-row gap-1 stack-actions">
                          <Link href={`/candidatos/${c.id_candidato}`} className="btn btn-primary btn-sm flex-fill">Editar</Link>
                          <button onClick={() => setPendingDelete(c)} className="btn btn-danger btn-sm flex-fill">Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pendingDelete && (
              <AppModal
                title="Confirmar eliminación"
                icon="trash-fill"
                onClose={()=> !deleting && setPendingDelete(null)}
                width={460}
                disableClose={deleting}
                footer={
                  <>
                    <button type="button" className="btn btn-soft-secondary btn-sm" onClick={()=>!deleting && setPendingDelete(null)} disabled={deleting}>Cancelar</button>
                    <button type="button" className="btn btn-danger btn-sm d-flex align-items-center gap-2" onClick={performDelete} disabled={deleting}>
                      {deleting && <span className="spinner-border spinner-border-sm" />}
                      {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                    </button>
                  </>
                }
              >
                <p className="mb-2">Esta acción marcará el candidato como eliminado.</p>
                <div className="mb-3 border rounded p-2 bg-light small">
                  <div><strong>ID:</strong> {pendingDelete.id_candidato}</div>
                  <div><strong>Nombre:</strong> {pendingDelete.candidato || '—'}</div>
                </div>
                <p className="text-danger fw-semibold mb-0">¿Deseas continuar?</p>
              </AppModal>
            )}
          </div>
        </div>
      </div>
    </BasePage>
  );
}
