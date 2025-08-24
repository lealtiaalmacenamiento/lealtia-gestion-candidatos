"use client";
import { useEffect, useState } from 'react';
import { getAuditoria } from '@/lib/api';
import type { Auditoria } from '@/types';
import BasePage from '@/components/BasePage';

export default function AuditoriaPage() {
  const [rows, setRows] = useState<Auditoria[]>([]);
  const [notif, setNotif] = useState<{ msg: string; type: 'success'|'error' } | null>(null);
  // Se eliminó botón/ver modal
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = async () => {
    try {
      const data = await getAuditoria();
      setRows(data);
    } catch (err) {
      setNotif({ msg: err instanceof Error ? err.message : 'Error', type: 'error' });
    }
  };

  useEffect(() => { load(); }, []);

  // Detalle removido

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pageRows = rows.slice(startIndex, endIndex);

  const goTo = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
  };

  const changePageSize = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setPageSize(newSize);
    setPage(1);
  };

  return (
    <BasePage title="Registros" alert={notif ? { type: notif.type === 'error' ? 'danger' : notif.type, message: notif.msg, show: true } : undefined}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold mb-0">Historial de registros</h2>
      </div>
      <div className="d-flex flex-wrap gap-3 align-items-end mb-2">
        <div className="small text-muted">Mostrando {total === 0 ? 0 : (startIndex + 1)}–{endIndex} de {total}</div>
        <div className="d-flex align-items-center gap-2 small">
          <label className="form-label m-0">Filas:</label>
          <select className="form-select form-select-sm w-auto" value={pageSize} onChange={changePageSize}>
            {[10,20,30,50,100].map(n=> <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="ms-auto d-flex align-items-center gap-1">
          <button className="btn btn-sm btn-outline-secondary" disabled={currentPage===1} onClick={()=>goTo(1)}>&laquo;</button>
          <button className="btn btn-sm btn-outline-secondary" disabled={currentPage===1} onClick={()=>goTo(currentPage-1)}>&lsaquo;</button>
          <span className="small px-2">{currentPage} / {totalPages}</span>
          <button className="btn btn-sm btn-outline-secondary" disabled={currentPage===totalPages} onClick={()=>goTo(currentPage+1)}>&rsaquo;</button>
            <button className="btn btn-sm btn-outline-secondary" disabled={currentPage===totalPages} onClick={()=>goTo(totalPages)}>&raquo;</button>
        </div>
      </div>
  <div className="table-responsive small">
    <table className="table table-striped table-hover align-middle shadow-sm mb-0">
          <thead className="table-dark">
            <tr>
              <th>Usuario</th>
      <th style={{width:120}}>Acción</th>
              <th>Fecha</th>
              <th>Tabla</th>
              <th>Snapshot</th>
              {/* Columna detalles eliminada */}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r: Auditoria) => (
              <tr key={r.id}>
                <td>{r.usuario}</td>
                <td className="text-truncate" style={{maxWidth:110, whiteSpace:'nowrap'}} title={r.accion}>{r.accion}</td>
                <td>{r.fecha}</td>
                <td>{r.tabla_afectada || '—'}</td>
                <td style={{minWidth:240, maxWidth:560}} className="small">
                  <pre className="mb-0 small bg-light p-2 border rounded" style={{whiteSpace:'pre-wrap', maxHeight:200, overflow:'auto'}}>{formatSnapshot(r.snapshot)}</pre>
                </td>
                {/* Botón detalles eliminado */}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-4 text-muted small">Sin registros</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
  {/* Modal eliminado */}
    </BasePage>
  );
}

function formatSnapshot(s: unknown): string {
  if (s == null) return '—';
  try { return JSON.stringify(s, null, 2); } catch { return String(s); }
}
