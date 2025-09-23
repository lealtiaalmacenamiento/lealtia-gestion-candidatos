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
  // Filtros
  const [fUsuario, setFUsuario] = useState('');
  const [fAccion, setFAccion] = useState('');
  const [fTabla, setFTabla] = useState('');
  const [fDesde, setFDesde] = useState(''); // yyyy-mm-dd
  const [fHasta, setFHasta] = useState(''); // yyyy-mm-dd

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

  // Filtrado: ocultar eventos de UI y aplicar filtros
  const filtered = rows.filter(r => {
    // ocultar ui_click y ui_page_view
    const accion = (r.accion || '').toLowerCase();
    if (accion === 'ui_click' || accion === 'ui_page_view') return false;
    // filtro por usuario
    if (fUsuario.trim()) {
      const s = fUsuario.trim().toLowerCase();
      if (!(r.usuario || '').toLowerCase().includes(s)) return false;
    }
    // filtro por acción
    if (fAccion.trim()) {
      const s = fAccion.trim().toLowerCase();
      if (!accion.includes(s)) return false;
    }
    // filtro por tabla
    if (fTabla.trim()) {
      const s = fTabla.trim().toLowerCase();
      if (!((r.tabla_afectada || '').toLowerCase().includes(s))) return false;
    }
    // filtro por rango de fechas (suponiendo r.fecha es ISO o legible por Date)
    if (fDesde) {
      const d = new Date(fDesde + 'T00:00:00');
      if (new Date(r.fecha) < d) return false;
    }
    if (fHasta) {
      const h = new Date(fHasta + 'T23:59:59');
      if (new Date(r.fecha) > h) return false;
    }
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pageRows = filtered.slice(startIndex, endIndex);

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
      {/* Filtros */}
      <div className="row g-2 mb-3">
        <div className="col-sm-6 col-md-3">
          <label className="form-label mb-1">Usuario</label>
          <input className="form-control form-control-sm" placeholder="Buscar por usuario" value={fUsuario} onChange={e=>{ setFUsuario(e.target.value); setPage(1); }} />
        </div>
        <div className="col-sm-6 col-md-3">
          <label className="form-label mb-1">Acción</label>
          <input className="form-control form-control-sm" placeholder="Buscar por acción" value={fAccion} onChange={e=>{ setFAccion(e.target.value); setPage(1); }} />
        </div>
        <div className="col-sm-6 col-md-3">
          <label className="form-label mb-1">Tabla</label>
          <input className="form-control form-control-sm" placeholder="Buscar por tabla" value={fTabla} onChange={e=>{ setFTabla(e.target.value); setPage(1); }} />
        </div>
        <div className="col-6 col-md-1">
          <label className="form-label mb-1">Desde</label>
          <input type="date" className="form-control form-control-sm" value={fDesde} onChange={e=>{ setFDesde(e.target.value); setPage(1); }} />
        </div>
        <div className="col-6 col-md-1">
          <label className="form-label mb-1">Hasta</label>
          <input type="date" className="form-control form-control-sm" value={fHasta} onChange={e=>{ setFHasta(e.target.value); setPage(1); }} />
        </div>
        <div className="col-12 col-md-1 d-flex align-items-end">
          <button className="btn btn-sm btn-outline-secondary w-100" onClick={()=>{ setFUsuario(''); setFAccion(''); setFTabla(''); setFDesde(''); setFHasta(''); setPage(1); }}>Limpiar</button>
        </div>
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
