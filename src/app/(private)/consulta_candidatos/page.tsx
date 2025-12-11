"use client";
import React, { useEffect, useMemo, useRef, useState, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Candidato } from '@/types';
import type { Parametro } from '@/types';
import { calcularDerivados, etiquetaProceso } from '@/lib/proceso';
import type { PhaseKey } from '@/lib/candidatePhases';
import { getCurrentPhase } from '@/lib/candidateFunnelUtils';
import CandidateFunnel from '@/components/CandidateFunnel';
import CandidateAlerts from '@/components/CandidateAlerts';

interface EtapaMeta { completed: boolean; by?: { email?: string; nombre?: string }; at?: string }
interface CandidatoExt extends Candidato { fecha_creacion_ct?: string; proceso?: string; etapas_completadas?: Record<string, EtapaMeta> }
import BasePage from '@/components/BasePage';
import AppModal from '@/components/ui/AppModal';
import { useAuth } from '@/context/AuthProvider';
import { exportCandidatoPDF, exportCandidatosExcel } from '@/lib/exporters'

// Tipos
type SortKey = keyof Pick<Candidato, 'id_candidato' | 'candidato' | 'mes' | 'mes_conexion' | 'efc' | 'ct' | 'fecha_tentativa_de_examen' | 'fecha_de_creacion' | 'ultima_actualizacion' | 'fecha_creacion_ct' | 'fecha_creacion_pop'>;
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
  const [savingFlag, setSavingFlag] = useState<number | null>(null);
  const [pendingUncheck, setPendingUncheck] = useState<{ c: CandidatoExt; key: keyof Candidato } | null>(null)
  const [uncheckReason, setUncheckReason] = useState('')
  const [unchecking, setUnchecking] = useState(false)
  // Búsqueda por nombre de candidato
  const [nameQuery, setNameQuery] = useState('')
  // Filtro por fase del embudo
  const [selectedPhase, setSelectedPhase] = useState<PhaseKey | null>(null)
  // ID del candidato a resaltar (desde query param)
  const highlightId = search?.get('highlight') ? Number(search.get('highlight')) : null
  // Sticky eliminado completamente; tabla estándar scrollable horizontal
  // (Sticky y hint eliminados)

  // Si todas las etapas están marcadas como completadas, mostrar "Agente" en Proceso
  const areAllEtapasCompleted = (c: CandidatoExt): boolean => {
    const etapas = c.etapas_completadas || {}
    const keys: Array<keyof Candidato> = [
      'periodo_para_registro_y_envio_de_documentos',
      'capacitacion_cedula_a1',
      'periodo_para_ingresar_folio_oficina_virtual',
      'periodo_para_playbook',
      'pre_escuela_sesion_unica_de_arranque',
      'fecha_limite_para_presentar_curricula_cdp',
      'inicio_escuela_fundamental'
    ]
    return keys.every(k => !!etapas[k as string]?.completed)
  }

  const toggleEtapa = async (c: CandidatoExt, etapaKey: keyof Candidato) => {
    // Mapear etiqueta de etapa a clave de etapas_completadas
    const map: Record<string, string> = {
      periodo_para_registro_y_envio_de_documentos: 'periodo_para_registro_y_envio_de_documentos',
      capacitacion_cedula_a1: 'capacitacion_cedula_a1',
      periodo_para_ingresar_folio_oficina_virtual: 'periodo_para_ingresar_folio_oficina_virtual',
      periodo_para_playbook: 'periodo_para_playbook',
      pre_escuela_sesion_unica_de_arranque: 'pre_escuela_sesion_unica_de_arranque',
      fecha_limite_para_presentar_curricula_cdp: 'fecha_limite_para_presentar_curricula_cdp',
      inicio_escuela_fundamental: 'inicio_escuela_fundamental'
    }
    const key = map[etapaKey as string]
    if (!key) return
    try {
      setSavingFlag(c.id_candidato)
  const current = c.etapas_completadas || {}
  const currentCompleted = !!(current[key]?.completed)
      // Si se va a desmarcar, pedir confirmación con motivo
      if (currentCompleted) {
        setPendingUncheck({ c, key: etapaKey })
        setUncheckReason('')
        return
      }
      const payload = { etapas_completadas: { [key]: { completed: true } } }
      const res = await fetch(`/api/candidatos/${c.id_candidato}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error actualizando etapa')
      // Actualizar en memoria con respuesta (incluye merge + metadatos)
  setData(d => d.map(x => x.id_candidato === c.id_candidato ? { ...(x as CandidatoExt), etapas_completadas: (j.etapas_completadas as Record<string, EtapaMeta> | undefined) } : x))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally { setSavingFlag(null) }
  }

  const confirmUncheck = async () => {
    if (!pendingUncheck) return
    const { c, key: etapaKey } = pendingUncheck
    const map: Record<string, string> = {
      periodo_para_registro_y_envio_de_documentos: 'periodo_para_registro_y_envio_de_documentos',
      capacitacion_cedula_a1: 'capacitacion_cedula_a1',
      periodo_para_ingresar_folio_oficina_virtual: 'periodo_para_ingresar_folio_oficina_virtual',
      periodo_para_playbook: 'periodo_para_playbook',
      pre_escuela_sesion_unica_de_arranque: 'pre_escuela_sesion_unica_de_arranque',
      fecha_limite_para_presentar_curricula_cdp: 'fecha_limite_para_presentar_curricula_cdp',
      inicio_escuela_fundamental: 'inicio_escuela_fundamental'
    }
    const key = map[etapaKey as string]
    if (!key) { setPendingUncheck(null); return }
    if (!uncheckReason.trim()) return // requerido
    try {
      setUnchecking(true)
      const payload = { etapas_completadas: { [key]: { completed: false } }, _etapa_uncheck: { key, reason: uncheckReason.trim() } }
      const res = await fetch(`/api/candidatos/${c.id_candidato}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error actualizando etapa')
      setData(d => d.map(x => x.id_candidato === c.id_candidato ? { ...(x as CandidatoExt), etapas_completadas: (j.etapas_completadas as Record<string, EtapaMeta> | undefined) } : x))
      setPendingUncheck(null)
      setUncheckReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally { setUnchecking(false) }
  }

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
        const { proceso, dias_desde_pop } = calcularDerivados({
          periodo_para_registro_y_envio_de_documentos: c.periodo_para_registro_y_envio_de_documentos,
          capacitacion_cedula_a1: c.capacitacion_cedula_a1,
          periodo_para_ingresar_folio_oficina_virtual: c.periodo_para_ingresar_folio_oficina_virtual,
          periodo_para_playbook: c.periodo_para_playbook,
            pre_escuela_sesion_unica_de_arranque: c.pre_escuela_sesion_unica_de_arranque,
          fecha_limite_para_presentar_curricula_cdp: c.fecha_limite_para_presentar_curricula_cdp,
          inicio_escuela_fundamental: c.inicio_escuela_fundamental,
          fecha_tentativa_de_examen: c.fecha_tentativa_de_examen,
          fecha_creacion_ct: c.fecha_creacion_ct,
          fecha_creacion_pop: (c as CandidatoExt).fecha_creacion_pop
        })
        c.proceso = proceso
        ;(c as CandidatoExt).dias_desde_pop = dias_desde_pop
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
    const norm = (s: string) => s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('es')
    const q = norm(nameQuery.trim())
    
    // Aplicar filtro por nombre
    let base = q
      ? data.filter(c => norm(String(c.candidato || ''))?.includes(q))
      : data
    
    // Aplicar filtro por fase del embudo
    if (selectedPhase) {
      base = base.filter(c => getCurrentPhase(c) === selectedPhase)
    }
    
    return [...base].sort((a, b) => {
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
  }, [data, sortKey, sortDir, nameQuery, selectedPhase]);

  // Scroll sync refs (definidos después de conocer filtered, aunque no dependan de él)
  const topScrollRef = useRef<HTMLDivElement|null>(null)
  const bodyScrollRef = useRef<HTMLDivElement|null>(null)
  const phantomRef = useRef<HTMLDivElement|null>(null)
  const syncTop = useCallback(()=>{ if(!bodyScrollRef.current || !topScrollRef.current) return; if(bodyScrollRef.current.scrollLeft!==topScrollRef.current.scrollLeft) bodyScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft },[])
  const syncBody = useCallback(()=>{ if(!bodyScrollRef.current || !topScrollRef.current) return; if(topScrollRef.current.scrollLeft!==bodyScrollRef.current.scrollLeft) topScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft },[])
  useEffect(()=>{ const update=()=>{ if(!phantomRef.current || !bodyScrollRef.current) return; const tbl = bodyScrollRef.current.querySelector('table') as HTMLTableElement|null; const w = tbl? tbl.scrollWidth: bodyScrollRef.current.scrollWidth; phantomRef.current.style.width = w+'px' }; update(); const ro = new ResizeObserver(()=>update()); if(bodyScrollRef.current) ro.observe(bodyScrollRef.current); return ()=> ro.disconnect() },[data, filtered])

  type ColumnDef = { key: AnyColKey; label: string; sortable?: boolean }
  const columns: ColumnDef[] = useMemo(() => ([
    { key: 'id_candidato', label: 'ID', sortable: true },
    { key: 'ct', label: 'CT', sortable: true },
    { key: 'pop' as unknown as keyof Candidato, label: 'POP' },
    { key: 'candidato', label: 'Candidato', sortable: true },
    { key: 'email_agente' as unknown as keyof Candidato, label: 'Email agente' },
  { key: 'fecha_creacion_ct', label: 'Fecha creación CT' },
  { key: 'mes_conexion', label: 'Mes conexión', sortable: true },
  { key: 'fecha_creacion_pop' as unknown as keyof Candidato, label: 'Fecha creación POP' },
  { key: 'dias_desde_pop' as unknown as keyof Candidato, label: 'Días desde POP' },
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

  const tableRef = useRef<HTMLTableElement | null>(null)

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
    if (c.email_agente) return; // no permitir cambiar
    setSelectedForAgente(c)
    setAgenteEmail('')
    setAgenteMeta(null)
  }
  const submitAgente = async (e: React.FormEvent) => {
    e.preventDefault()
  if (!selectedForAgente) return
  if (selectedForAgente.email_agente) { setAgenteMeta({ error: 'Ya tiene agente asignado' }); return }
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

  // Exportar a Excel real (.xlsx) usando librería; evita problemas de acentos
  const exportExcelXlsx = React.useCallback(() => {
    if (!filtered.length) return;
    exportCandidatosExcel(filtered);
  }, [filtered]);

  // 'proceso' ya se adjunta en fetchData vía calcularDerivados

  // (utilidades CSV eliminadas; ahora generamos XLSX y se mantiene codificación correcta)

  const [fichaMensajes, setFichaMensajes] = useState<Record<string, string>>({});
const [mensajesCargados, setMensajesCargados] = useState(false);

// Fetch mensajes ficha_candidato al montar
useEffect(() => {
  fetch('/api/parametros?tipo=ficha_candidato')
    .then(r => r.ok ? r.json() : Promise.reject(new Error('Error al obtener parámetros')))
    .then(j => {
      if (j && Array.isArray(j.data)) {
        const mensajes: Record<string, string> = {};
        j.data.forEach((p: Parametro) => {
          if (p.clave && typeof p.valor === 'string') mensajes[p.clave] = p.valor;
        });
        setFichaMensajes(mensajes);
      } else {
        setFichaMensajes({});
      }
      setMensajesCargados(true);
    })
    .catch(() => {
      setFichaMensajes({});
      setMensajesCargados(true);
    });
}, []);

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
      
      {/* Embudo y alertas - solo para superusuarios y supervisores */}
      {!loading && !error && (role === 'superusuario' || role === 'supervisor' || role === 'admin') && (
        <div className="row g-3 mb-4">
          <div className="col-lg-8">
            <CandidateFunnel 
              candidatos={data}
              selectedPhase={selectedPhase}
              onPhaseClick={(phase) => setSelectedPhase(phase === selectedPhase ? null : phase)}
            />
          </div>
          <div className="col-lg-4">
            <CandidateAlerts candidatos={data} />
          </div>
        </div>
      )}
      
      <div className="d-flex justify-content-between align-items-center gap-3 mb-2">
        <div></div>
        <div className="d-flex align-items-center gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Buscar candidato..."
            value={nameQuery}
            onChange={e=>setNameQuery(e.target.value)}
            style={{ minWidth: 240 }}
            title="Buscar por nombre de candidato"
          />
          <button className="btn btn-outline-secondary btn-sm" onClick={fetchData} disabled={loading}>{loading ? '...' : 'Recargar'}</button>
          <button className="btn btn-outline-success btn-sm" onClick={exportExcelXlsx} disabled={loading || filtered.length===0} title="Exportar listado a Excel">Exportar Excel</button>
        </div>
      </div>
      {/* Hint de scroll eliminado con sticky */}
      {loading && (
        <div className="table-responsive fade-in-scale">
          <table ref={tableRef} className="table table-sm table-bordered align-middle mb-0 table-nowrap table-sticky">
            <thead className="table-light"><tr><th colSpan={columns.length + (readOnly ? 0 : 1)}>Cargando...</th></tr></thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="placeholder-glow">
                  {Array.from({ length: columns.length + (readOnly ? 0 : 1) }).map((__, c) => (<td key={c}><span className="placeholder col-8" /></td>))}
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
        <div className="fade-in-scale">
          {/* Barra de scroll superior + mensaje */}
          <div className="d-flex justify-content-between align-items-center mb-1 small">
            <div className="text-muted">Mostrando {filtered.length} de {data.length} registros cargados.</div>
            <div style={{flex:1}}></div>
          </div>
          <div className="position-relative mb-2" style={{overflow:'hidden'}}>
            <div ref={topScrollRef} onScroll={syncTop} style={{overflowX:'auto', overflowY:'hidden', WebkitOverflowScrolling:'touch'}}><div ref={phantomRef} style={{height:1}} /></div>
          </div>
          <div className="table-responsive hide-h-scrollbar" ref={bodyScrollRef} onScroll={syncBody}>
          <table ref={tableRef} className="table table-sm table-bordered align-middle mb-0 table-nowrap table-sticky">
            <thead className="table-dark">
              <tr>
                {columns.map((col) => {
                  return (
                    <React.Fragment key={String(col.key)}>
                      <Th
                        label={col.label}
                        k={col.key as AnyColKey}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={col.sortable ? toggleSort : undefined}
                        sortable={col.sortable}
                        width={undefined}
                        className={''}
                        stickyLeft={undefined}
                      />
                      {!readOnly && col.key === ('email_agente' as unknown as keyof Candidato) && (<th>Acciones</th>)}
                    </React.Fragment>
                  )
                })}
              </tr>
            </thead>
            <tbody>
                  {filtered.map((c, idx) => {
                    const isHighlighted = highlightId && c.id_candidato === highlightId
                    return (
                <tr 
                  key={c.id_candidato} 
                  className={`dash-anim stagger-${(idx % 6)+1} ${isHighlighted ? 'highlight-row' : ''}`}
                  style={isHighlighted ? { 
                    scrollMarginTop: '100px'
                  } : undefined}
                  ref={isHighlighted ? (el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' }) : undefined}
                > 
                  {columns.map((col) => {
                    const key = col.key as keyof Candidato;
                    const value = c[key];
                    const cls = (col.key === 'fecha_de_creacion' && !c.fecha_de_creacion) || (col.key === 'ultima_actualizacion' && !c.ultima_actualizacion) || (col.key === 'fecha_tentativa_de_examen' && !c.fecha_tentativa_de_examen) ? 'text-muted' : '';
                    const allCompleted = areAllEtapasCompleted(c as CandidatoExt)
                    const isAgente = allCompleted
                    const display = (col.key === 'fecha_de_creacion')
                      ? (formatDate(c.fecha_de_creacion) || '-')
                      : (col.key === 'ultima_actualizacion'
                        ? (formatDate(c.ultima_actualizacion) || '-')
                        : (col.key === 'fecha_tentativa_de_examen'
                          ? (formatDate(c.fecha_tentativa_de_examen) || '-')
                          : (col.key === 'fecha_creacion_ct'
                            ? (formatDate(c.fecha_creacion_ct) || '-')
                            : (col.key === 'mes_conexion'
                              ? (formatMesConexion(c.mes_conexion) || '-')
                              : (col.key === 'proceso'
                                ? (isAgente ? 'Agente' : (etiquetaProceso((c as unknown as { proceso?: string }).proceso) || ''))
                                : value)))));
                    const etapaKeys = new Set([
                      'fecha_tentativa_de_examen',
                      'periodo_para_registro_y_envio_de_documentos',
                      'capacitacion_cedula_a1',
                      'periodo_para_ingresar_folio_oficina_virtual',
                      'periodo_para_playbook',
                      'pre_escuela_sesion_unica_de_arranque',
                      'fecha_limite_para_presentar_curricula_cdp',
                      'inicio_escuela_fundamental'
                    ])
                    const isEtapa = etapaKeys.has(col.key as string)
                    const etapas = (c as CandidatoExt).etapas_completadas || {}
                    const etKey = col.key as string
                    const checked = !!etapas[etKey]?.completed
                    const meta = etapas[etKey]
                    const rawProceso = (isAgente ? 'Agente' : ((c as unknown as { proceso?: string }).proceso || ''))
                    const tdClass = cls
                    return (
                      <React.Fragment key={String(col.key)}>
                        <td 
                          className={tdClass} 
                          title={col.key==='proceso' ? rawProceso : undefined}
                          style={isHighlighted ? { 
                            backgroundColor: '#cfe2ff', 
                            color: '#084298', 
                            fontWeight: '600',
                            borderLeft: col.key === 'id_candidato' ? '4px solid #0d6efd' : undefined,
                            borderRight: col.key === (columns[columns.length - 1]?.key ?? '') ? '4px solid #0d6efd' : undefined
                          } : undefined}
                        >
                          <div className="d-flex flex-column gap-1" style={isHighlighted ? { color: '#084298' } : undefined}>
                            <Cell v={display} />
                            {isEtapa && (
                              <label className="small d-flex align-items-center gap-2">
                                <input type="checkbox" className="form-check-input" checked={checked} disabled={savingFlag===c.id_candidato || !!c.eliminado}
                                  onChange={()=>toggleEtapa(c, col.key as AnyColKey)} />
                                <span>Completado</span>
                              </label>
                            )}
                            {isEtapa && checked && meta?.at && (
                              <div className="form-text small">
                                Marcado el {formatDate(meta.at)} por {meta.by?.nombre || ''} {meta.by?.email ? `(${meta.by.email})` : ''}
                              </div>
                            )}
                          </div>
                        </td>
                        {!readOnly && col.key === ('email_agente' as unknown as keyof Candidato) && (
                          <td style={{whiteSpace:'nowrap'}}>
                            <button
                              className="btn btn-sm btn-primary me-1"
                              onClick={() => handleEdit(c.id_candidato)}
                              disabled={deleting === c.id_candidato}
                            >Editar</button>
                            <button
                              className="btn btn-sm btn-outline-secondary me-1"
                              onClick={() => {
                                // Usar fichaMensajes del estado React
                                console.debug('[DEBUG][CONSULTA] fichaMensajes justo antes de exportar:', fichaMensajes);
                                if (!mensajesCargados) {
                                  alert('Los mensajes aún no están cargados. Intenta de nuevo en unos segundos.');
                                  return;
                                }
                                if (!fichaMensajes || Object.keys(fichaMensajes).length === 0) {
                                  console.error('[ERROR][CONSULTA] fichaMensajes está vacío o undefined. No se puede exportar PDF.');
                                  alert('No se puede exportar el PDF porque los mensajes parametrizados no están cargados.');
                                  return;
                                }
                                exportCandidatoPDF(c, fichaMensajes);
                              }}
                              disabled={!mensajesCargados || !fichaMensajes || Object.keys(fichaMensajes).length === 0}
                            >PDF</button>
                            {!c.email_agente && <button className="btn btn-sm btn-outline-success me-1" onClick={()=>openAgenteModal(c)} title="Asignar email agente">Asignar agente</button>}
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => setPendingDelete(c)}
                              disabled={deleting === c.id_candidato}
                            >{deleting === c.id_candidato ? '...' : 'Eliminar'}</button>
                          </td>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tr>
              )
            })}
            </tbody>
          </table>
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
              <strong>Candidato:</strong> {selectedForAgente.candidato || '—'} (ID {selectedForAgente.id_candidato})
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
      {pendingUncheck && (
        <AppModal
          title="Confirmar desmarcar etapa"
          icon="exclamation-triangle-fill"
          width={520}
          onClose={()=> !unchecking && setPendingUncheck(null)}
          disableClose={unchecking}
          footer={<>
            <button type="button" className="btn btn-soft-secondary btn-sm" onClick={()=>!unchecking && setPendingUncheck(null)} disabled={unchecking}>Cancelar</button>
            <button type="button" className="btn btn-danger btn-sm d-flex align-items-center gap-2" onClick={confirmUncheck} disabled={unchecking || !uncheckReason.trim()}>
              {unchecking && <span className="spinner-border spinner-border-sm" />}
              {unchecking ? 'Guardando…' : 'Sí, desmarcar'}
            </button>
          </>}
        >
          <p className="mb-2 small">Indica el motivo para desmarcar esta etapa. Se registrará en auditoría.</p>
          <div className="mb-2">
            <textarea className="form-control" rows={3} value={uncheckReason} onChange={e=>setUncheckReason(e.target.value)} placeholder="Motivo (requerido)" required disabled={unchecking} />
          </div>
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
  className?: string;
  stickyLeft?: number;
}

function Th({ label, k, sortKey, sortDir, onSort, sortable, width, className, stickyLeft }: ThProps) {
  const active = sortable && sortKey === k;
  const handle = () => { if (sortable && onSort) onSort(k as SortKey); };
  const style = {
    whiteSpace: 'nowrap' as const,
    cursor: sortable ? 'pointer' as const : 'default' as const,
    width,
    maxWidth: width,
    minWidth: width,
    // Let CSS control z-index for thead sticky cells to avoid layering issues
    ...(typeof stickyLeft === 'number' ? { position: 'sticky' as const, left: stickyLeft } : {})
  }
  return (
    <th role={sortable ? 'button' : undefined} onClick={handle} className={[sortable ? 'user-select-none' : '', className].filter(Boolean).join(' ')} style={style}>
      {label} {active && (<i className={`bi bi-caret-${sortDir === 'asc' ? 'up' : 'down'}-fill text-secondary ms-1`}></i>)}
    </th>
  );
}

function formatMesConexion(v?: string | null) {
  if (!v) return ''
  if (/^\d{4}-\d{2}$/.test(v)) {
    const [y, m] = v.split('-')
    return `${m}/${y}`
  }
  return formatDate(v) || v
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

// Estilos para highlight
const styles = `
  .highlight-row {
    position: relative;
    z-index: 10;
  }
  .highlight-row td {
    background-color: #cfe2ff !important;
    color: #084298 !important;
    border-top: 2px solid #0d6efd !important;
    border-bottom: 2px solid #0d6efd !important;
    font-weight: 600 !important;
  }
  .highlight-row td:first-child {
    border-left: 4px solid #0d6efd !important;
  }
  .highlight-row td:last-child {
    border-right: 4px solid #0d6efd !important;
  }
  .highlight-row td span {
    color: #084298 !important;
  }
`

if (typeof document !== 'undefined' && !document.getElementById('highlight-styles')) {
  const styleSheet = document.createElement('style')
  styleSheet.id = 'highlight-styles'
  styleSheet.textContent = styles
  document.head.appendChild(styleSheet)
}
