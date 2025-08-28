"use client";
import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Candidato } from '@/types';
import { calcularDerivados, etiquetaProceso } from '@/lib/proceso';

interface CandidatoExt extends Candidato { fecha_creacion_ct?: string; proceso?: string }
import BasePage from '@/components/BasePage';
import AppModal from '@/components/ui/AppModal';
import { useAuth } from '@/context/AuthProvider';

// Tipos
type SortKey = keyof Pick<Candidato, 'id_candidato' | 'candidato' | 'mes' | 'efc' | 'ct' | 'fecha_tentativa_de_examen' | 'fecha_de_creacion' | 'ultima_actualizacion' | 'fecha_creacion_ct'>;
type AnyColKey = keyof Candidato;

export default function ConsultaCandidatosPage() {
  return (
    <Suspense fallback={<BasePage title="Consulta de candidatos"><div className="text-center py-5"><div className="spinner-border" /></div></BasePage>}>
      <ConsultaCandidatosInner />
    </Suspense>
  );
}

function ConsultaCandidatosInner() {
  const search = useSearchParams();
  const { user } = useAuth();
  const role = (user?.rol || '').toLowerCase();
  const readOnly = role === 'viewer' || role === 'lector';
  const [data, setData] = useState<Candidato[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('ultima_actualizacion');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc'); // más reciente primero
  const abortRef = useRef<AbortController | null>(null);
  // const [reloading, setReloading] = useState(false); // no usado actualmente
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchData = React.useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
  const r = await fetch(`/api/candidatos`, { signal: controller.signal });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      const arr: Candidato[] = Array.isArray(j) ? j : [];
      // Adjuntar derivados (proceso, dias) en memoria
      (arr as CandidatoExt[]).forEach(c => {
        const { proceso } = calcularDerivados({
          periodo_para_registro_y_envio_de_documentos: c.periodo_para_registro_y_envio_de_documentos,
          capacitacion_cedula_a1: c.capacitacion_cedula_a1,
          periodo_para_ingresar_folio_oficina_virtual: c.periodo_para_ingresar_folio_oficina_virtual,
          periodo_para_playbook: c.periodo_para_playbook,
            pre_escuela_sesion_unica_de_arranque: c.pre_escuela_sesion_unica_de_arranque,
          fecha_limite_para_presentar_curricula_cdp: c.fecha_limite_para_presentar_curricula_cdp,
          inicio_escuela_fundamental: c.inicio_escuela_fundamental,
          fecha_tentativa_de_examen: c.fecha_tentativa_de_examen,
          fecha_creacion_ct: c.fecha_creacion_ct
        })
        c.proceso = proceso
      })
      arr.sort((a,b)=>{
        const ua = Date.parse(a.ultima_actualizacion || a.fecha_de_creacion || '') || 0;
        const ub = Date.parse(b.ultima_actualizacion || b.fecha_de_creacion || '') || 0;
        return ub - ua;
      });
      setData(arr);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // request cancelada
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
  setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let comp: number;
  if (sortKey === 'fecha_de_creacion' || sortKey === 'ultima_actualizacion' || sortKey === 'fecha_tentativa_de_examen') {
        const ta = Date.parse(String(av)) || 0;
        const tb = Date.parse(String(bv)) || 0;
        comp = ta - tb;
      } else if (typeof av === 'number' && typeof bv === 'number') comp = av - bv;
      else comp = String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' });
      return comp * (sortDir === 'asc' ? 1 : -1);
    });
  }, [data, sortKey, sortDir]);

  const columns = useMemo(() => ([
    { key: 'id_candidato', label: 'ID', sortable: true },
    { key: 'ct', label: 'CT', sortable: true },
  { key: 'candidato', label: 'Candidato', sortable: true },
  { key: 'email_agente' as unknown as keyof Candidato, label: 'Email agente' },
  { key: 'fecha_creacion_ct', label: 'Fecha creación CT' },
  { key: 'proceso', label: 'Proceso' },
  { key: 'mes', label: 'Cédula A1', sortable: true },
    { key: 'periodo_para_registro_y_envio_de_documentos', label: 'Periodo registro/envío' },
    { key: 'capacitacion_cedula_a1', label: 'Capacitación A1' },
    { key: 'fecha_tentativa_de_examen', label: 'Fecha tentativa examen', sortable: true },
    { key: 'efc', label: 'EFC', sortable: true },
    { key: 'periodo_para_ingresar_folio_oficina_virtual', label: 'Periodo folio OV' },
    { key: 'periodo_para_playbook', label: 'Periodo Playbook' },
    { key: 'pre_escuela_sesion_unica_de_arranque', label: 'Pre Escuela' },
    { key: 'fecha_limite_para_presentar_curricula_cdp', label: 'Currícula CDP' },
    { key: 'inicio_escuela_fundamental', label: 'Inicio Escuela' },
    { key: 'seg_gmm', label: 'SEG GMM' },
    { key: 'seg_vida', label: 'SEG VIDA' },
  // columnas derivadas ya incluidas arriba (no duplicar)
    { key: 'fecha_de_creacion', label: 'Creado', sortable: true },
    { key: 'ultima_actualizacion', label: 'Actualizado', sortable: true },
    { key: 'usuario_creador', label: 'Creador' },
    { key: 'usuario_que_actualizo', label: 'Actualizó' }
  ]), []);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  // const onReload = () => { setReloading(true); fetchData(); };

  // Modal de eliminación
  const [pendingDelete, setPendingDelete] = useState<Candidato | null>(null);
  const handleEdit = (id: number) => { window.location.href = `/candidatos/nuevo/${id}`; };
  // Modal asignar email agente
  const [assigning, setAssigning] = useState(false)
  const [selectedForAgente, setSelectedForAgente] = useState<Candidato | null>(null)
  const [agenteEmail, setAgenteEmail] = useState('')
  interface AgenteMeta {
    created?: boolean
    existed?: boolean
    passwordTemporal?: string
    correoEnviado?: boolean
    correoError?: string
    error?: string
    ok?: boolean
  }
  const [agenteMeta, setAgenteMeta] = useState<AgenteMeta | null>(null)
  const openAgenteModal = (c: Candidato) => {
    setSelectedForAgente(c)
    setAgenteEmail(c.email_agente || '')
    setAgenteMeta(null)
  }
  const submitAgente = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedForAgente) return
    const email = agenteEmail.trim().toLowerCase()
    if (!/.+@.+\..+/.test(email)) { setAgenteMeta({ error: 'Email inválido' }); return }
    try {
      setAssigning(true)
      const res = await fetch(`/api/candidatos/${selectedForAgente.id_candidato}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email_agente: email }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error asignando email')
      setAgenteMeta(j._agente_meta || { ok: true })
      // Actualizar en memoria
      setData(d => d.map(x => x.id_candidato === selectedForAgente.id_candidato ? { ...x, email_agente: email } : x))
      if (!j._agente_meta?.error) {
        setTimeout(()=>{ setSelectedForAgente(null) }, 1200)
      }
    } catch (er) {
      setAgenteMeta({ error: er instanceof Error ? er.message : 'Error' })
    } finally {
      setAssigning(false)
    }
  }

  const performDelete = async () => {
    if (!pendingDelete) return;
    try {
      setDeleting(pendingDelete.id_candidato);
      const res = await fetch(`/api/candidatos/${pendingDelete.id_candidato}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Error eliminando');
      // Redirige para mostrar alerta de eliminado (coherente con la página de edición)
      window.location.href = `/consulta_candidatos?deleted=1&id=${pendingDelete.id_candidato}&name=${encodeURIComponent(pendingDelete.candidato || '')}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      setError(msg);
    } finally {
      setDeleting(null);
      setPendingDelete(null);
    }
  };

  // Exportar a Excel (xlsx simple generado en cliente)
  const exportExcel = () => {
    // Construimos CSV y lo marcamos como .xls para apertura rápida en Excel.
    const headers = columns.map(c=>c.label).join(',');
    const rows = filtered.map(c => columns.map(col => {
      const k = col.key as keyof Candidato | 'dias_desde_creacion_ct';
      if (k === 'dias_desde_creacion_ct') return calcDias(c.fecha_creacion_ct);
      return sanitizeCsv(c[k]);
    }).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `candidatos_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 'proceso' ya se adjunta en fetchData vía calcularDerivados

  function calcDias(fecha?: string) {
    if (!fecha) return '';
    const t = Date.parse(fecha);
    if (!t) return '';
    const diff = Date.now() - t;
    return Math.floor(diff / 86400000); // días
  }

  function sanitizeCsv(val: unknown) {
    if (val == null) return '';
    const s = String(val).replace(/"/g,'""');
    if (s.search(/[",\n]/) >= 0) return '"'+s+'"';
    return s;
  }

  return (
  <BasePage title="Consulta de candidatos">
      {search?.get('deleted') === '0' && (
        <div className="alert alert-warning alert-animated py-3 small d-flex justify-content-between align-items-center shadow-sm">
          <div className="me-4">
            <strong>Eliminado:</strong> candidato ID {search.get('id')} {search.get('name') && <>(<span className="text-dark">({decodeURIComponent(search.get('name')||'')})</span>)</>}.
          </div>
          <a href="/consulta_candidatos" className="btn-close" aria-label="Cerrar" title="Cerrar"></a>
        </div>
      )}
      <div className="d-flex justify-content-end align-items-center gap-3 mb-2">
        <button className="btn btn-outline-secondary btn-sm" onClick={fetchData} disabled={loading}>{loading ? '...' : 'Recargar'}</button>
      </div>
      {loading && (
        <div className="table-responsive fade-in-scale">
          <table className="table table-sm table-bordered align-middle mb-0 table-nowrap table-sticky">
            <thead className="table-light"><tr><th colSpan={columns.length + (readOnly ? 0 : 1)}>Cargando...</th></tr></thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="placeholder-glow">
                  {Array.from({length:19}).map((__,c)=>(<td key={c}><span className="placeholder col-8" /></td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="alert alert-info">Sin registros</div>
      )}

  {!loading && filtered.length > 0 && (
        <div className="table-responsive fade-in-scale">
          <table className="table table-sm table-bordered align-middle mb-0 table-nowrap table-sticky">
            <thead className="table-dark">
              <tr>
                {columns.map(col => (
                  <Th key={col.key} label={col.label} k={col.key as AnyColKey} sortKey={sortKey} sortDir={sortDir} onSort={col.sortable ? toggleSort : undefined} sortable={col.sortable} />
                ))}
                {!readOnly && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
                  {filtered.map((c, idx) => (
                <tr key={c.id_candidato} className={`${c.eliminado ? 'table-danger' : ''} dash-anim stagger-${(idx % 6)+1}`}> 
                  {columns.map(col => {
                    const key = col.key as keyof Candidato;
                    const value = c[key];
                    const cls = (col.key === 'fecha_de_creacion' && !c.fecha_de_creacion) || (col.key === 'ultima_actualizacion' && !c.ultima_actualizacion) || (col.key === 'fecha_tentativa_de_examen' && !c.fecha_tentativa_de_examen) ? 'text-muted' : '';
                    const display = (col.key === 'fecha_de_creacion')
                      ? (formatDate(c.fecha_de_creacion) || '-')
                      : (col.key === 'ultima_actualizacion'
                        ? (formatDate(c.ultima_actualizacion) || '-')
                        : (col.key === 'fecha_tentativa_de_examen'
                          ? (formatDate(c.fecha_tentativa_de_examen) || '-')
                          : (col.key === 'fecha_creacion_ct'
                            ? (formatDate(c.fecha_creacion_ct) || '-')
                             : (col.key === 'proceso'
                               ? etiquetaProceso((c as unknown as { proceso?: string }).proceso) || ''
                              : value))));
                    const rawProceso = (c as unknown as { proceso?: string }).proceso || ''
                    return (
                      <td key={col.key} className={cls} title={col.key==='proceso' ? rawProceso : undefined}>
                        <Cell v={display} />
                      </td>
                    )
                  })}
          {!readOnly && (
                    <td style={{whiteSpace:'nowrap'}}>
                      <button
                        className="btn btn-sm btn-primary me-1"
                        onClick={() => handleEdit(c.id_candidato)}
                        disabled={deleting === c.id_candidato}
                      >Editar</button>
                      <a className="btn btn-sm btn-outline-secondary me-1" href={`/api/candidatos/${c.id_candidato}?export=pdf`} target="_blank" rel="noopener noreferrer">PDF</a>
                      <button
                        className={`btn btn-sm ${c.email_agente ? 'btn-outline-warning' : 'btn-outline-success'} me-1`}
                        onClick={()=>openAgenteModal(c)}
                        title={c.email_agente ? 'Cambiar email agente' : 'Asignar email agente'}
                      >{c.email_agente ? 'Cambiar agente' : 'Asignar agente'}</button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setPendingDelete(c)}
                        disabled={deleting === c.id_candidato}
                      >{deleting === c.id_candidato ? '...' : 'Eliminar'}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="d-flex justify-content-between align-items-center mt-2 small">
            <div className="text-muted">Mostrando {filtered.length} de {data.length} registros cargados.</div>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-outline-success" onClick={exportExcel} title="Exportar listado a Excel">Exportar Excel</button>
            </div>
          </div>
        </div>
      )}
      {pendingDelete && (
        <AppModal
          title="Confirmar eliminación"
          icon="trash-fill"
          width={460}
          onClose={()=> !deleting && setPendingDelete(null)}
          disableClose={!!deleting}
          footer={<>
            <button type="button" className="btn btn-soft-secondary btn-sm" onClick={()=>!deleting && setPendingDelete(null)} disabled={!!deleting}>Cancelar</button>
            <button type="button" className="btn btn-danger btn-sm d-flex align-items-center gap-2" onClick={performDelete} disabled={!!deleting}>
              {deleting && <span className="spinner-border spinner-border-sm" />}
              {deleting ? 'Eliminando…' : 'Sí, eliminar'}
            </button>
          </>}
        >
          <p className="mb-2">Esta acción marcará el candidato como eliminado.</p>
          <div className="mb-3 border rounded p-2 bg-light small">
            <div><strong>ID:</strong> {pendingDelete.id_candidato}</div>
            <div><strong>Nombre:</strong> {pendingDelete.candidato || '—'}</div>
          </div>
          <p className="text-danger fw-semibold mb-0">¿Deseas continuar?</p>
        </AppModal>
      )}
      {selectedForAgente && (
        <AppModal
          title="Asignar email agente"
          icon="person-plus-fill"
          width={500}
          onClose={()=> !assigning && setSelectedForAgente(null)}
          disableClose={assigning}
          footer={null}
        >
          <form onSubmit={submitAgente} className="needs-validation" noValidate>
            <div className="mb-3 small">
              <strong>Candidato:</strong> {selectedForAgente.candidato || '—'} (ID {selectedForAgente.id_candidato})<br />
              {selectedForAgente.email_agente && <span className="text-muted">Actual: {selectedForAgente.email_agente}</span>}
            </div>
            <div className="mb-3">
              <label className="form-label">Email del agente</label>
              <input type="email" className="form-control" value={agenteEmail} onChange={e=>setAgenteEmail(e.target.value)} required disabled={assigning} placeholder="agente@dominio.com" />
            </div>
            {agenteMeta && (
              <div className={`alert py-2 small ${agenteMeta.error ? 'alert-danger' : 'alert-info'}`}>
                {agenteMeta.error && <><strong>Error:</strong> {agenteMeta.error}</>}
                {!agenteMeta.error && (
                  <>
                    {agenteMeta.created && <div>Usuario agente creado.</div>}
                    {agenteMeta.existed && <div>El usuario ya existía.</div>}
                    {agenteMeta.passwordTemporal && <div>Password temporal: <code>{agenteMeta.passwordTemporal}</code></div>}
                    {agenteMeta.correoEnviado === true && <div>Correo de bienvenida enviado.</div>}
                    {agenteMeta.correoEnviado === false && <div>No se pudo enviar correo: {agenteMeta.correoError || 'Error desconocido'}</div>}
                    {!agenteMeta.created && !agenteMeta.existed && !agenteMeta.error && <div>Asignado.</div>}
                  </>
                )}
              </div>
            )}
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-soft-secondary btn-sm" onClick={()=>!assigning && setSelectedForAgente(null)} disabled={assigning}>Cerrar</button>
              <button type="submit" className="btn btn-success btn-sm d-flex align-items-center gap-2" disabled={assigning}>
                {assigning && <span className="spinner-border spinner-border-sm" />}
                {assigning ? 'Asignando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </AppModal>
      )}
    </BasePage>
  );
}

interface ThProps {
  label: string;
  k: AnyColKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort?: (k: SortKey) => void;
  sortable?: boolean;
  width?: string;
}

function Th({ label, k, sortKey, sortDir, onSort, sortable, width }: ThProps) {
  const active = sortable && sortKey === k;
  const handle = () => { if (sortable && onSort) onSort(k as SortKey); };
  return (
    <th role={sortable ? 'button' : undefined} onClick={handle} className={sortable ? 'user-select-none' : ''} style={{ whiteSpace: 'nowrap', cursor: sortable ? 'pointer' : 'default', width, maxWidth: width }}>
      {label} {active && (<i className={`bi bi-caret-${sortDir === 'asc' ? 'up' : 'down'}-fill text-secondary ms-1`}></i>)}
    </th>
  );
}

function formatDate(v?: string) {
  if (!v) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y,m,d] = v.split('-')
    return `${d}/${m}/${y.slice(2)}`
  }
  const dObj = new Date(v)
  if (isNaN(dObj.getTime())) return v
  return dObj.toLocaleDateString('es-MX', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

function oneLine(val: unknown) {
  if (val == null) return '';
  return String(val).replace(/\s+/g, ' ').trim();
}

interface CellProps { v: unknown }
function Cell({ v }: CellProps) {
  const text = oneLine(v);
  return <span title={text} style={{ display: 'inline-block', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{text}</span>;
}
