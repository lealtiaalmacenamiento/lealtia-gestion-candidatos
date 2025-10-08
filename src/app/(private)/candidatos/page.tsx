'use client';
import { useEffect, useState, useRef, useCallback } from 'react';

import { getCandidatos, deleteCandidato } from '@/lib/api';
import { calcularDerivados, etiquetaProceso } from '@/lib/proceso';
import { exportCandidatosExcel, exportCandidatoPDF } from '@/lib/exporters';
import AppModal from '@/components/ui/AppModal';
import type { Candidato, Parametro } from '@/types';
import BasePage from '@/components/BasePage';
import Link from 'next/link';

export default function CandidatosPage() {
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [notif, setNotif] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Candidato | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Parametrización de mensajes para ficha de candidato
  const [fichaMensajes, setFichaMensajes] = useState<Record<string, string>>({});
  const [mensajesCargados, setMensajesCargados] = useState(false);
  // refs para scroll sincronizado
  const scrollBodyRef = useRef<HTMLDivElement|null>(null)
  const scrollTopRef = useRef<HTMLDivElement|null>(null)
  const phantomRef = useRef<HTMLDivElement|null>(null)

  // Sincroniza top -> body
  const onTopScroll = useCallback(()=> {
    if(!scrollBodyRef.current || !scrollTopRef.current) return
    if(scrollBodyRef.current.scrollLeft !== scrollTopRef.current.scrollLeft){
      scrollBodyRef.current.scrollLeft = scrollTopRef.current.scrollLeft
    }
  },[])
  // Sincroniza body -> top
  const onBodyScroll = useCallback(()=> {
    if(!scrollBodyRef.current || !scrollTopRef.current) return
    if(scrollTopRef.current.scrollLeft !== scrollBodyRef.current.scrollLeft){
      scrollTopRef.current.scrollLeft = scrollBodyRef.current.scrollLeft
    }
  },[])

  // Ajustar ancho del phantom al de la tabla
  useEffect(()=>{
    const update = ()=>{
      if(!phantomRef.current || !scrollBodyRef.current) return
      const table = scrollBodyRef.current.querySelector('table') as HTMLTableElement | null
      const w = table? table.scrollWidth : scrollBodyRef.current.scrollWidth
      phantomRef.current.style.width = w + 'px'
    }
    update()
    const ro = new ResizeObserver(()=> update())
    if(scrollBodyRef.current) ro.observe(scrollBodyRef.current)
    return ()=> { ro.disconnect() }
  },[candidatos])

  useEffect(() => {
    getCandidatos().then(setCandidatos).catch(err => setNotif(err.message));
    // Fetch mensajes ficha_candidato
    fetch('/api/parametros?tipo=ficha_candidato')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Error al obtener parámetros')))
      .then(j => {
        // Espera { success: true, data: Parametro[] }
        if (j && Array.isArray(j.data)) {
          // Mapear clave->valor
          const mensajes: Record<string, string> = {};
          j.data.forEach((p: Parametro) => {
            if (p.clave && typeof p.valor === 'string') mensajes[p.clave] = p.valor;
          });
          console.log('[DEBUG] fichaMensajes:', mensajes);
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
            <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
              <h2 className="mb-0">Candidatos</h2>
              <div className="d-flex gap-2 ms-auto">
                <button className="btn btn-outline-primary btn-sm" onClick={()=>exportCandidatosExcel(candidatos)}>Exportar Excel</button>
                <Link href="/candidatos/nuevo" className="btn btn-success btn-sm">Nuevo</Link>
              </div>
            </div>
            {/* Scrollbar superior */}
            <div className="position-relative mb-1" style={{overflow:'hidden'}}>
              <div
                ref={scrollTopRef}
                onScroll={onTopScroll}
                style={{
                  overflowX:'auto',
                  overflowY:'hidden',
                  WebkitOverflowScrolling:'touch'
                }}
              >
                <div ref={phantomRef} style={{height:1}} />
              </div>
            </div>
            <div className="table-responsive small" ref={scrollBodyRef} onScroll={onBodyScroll} style={{scrollbarWidth:'thin'}}>
              <table className="table table-bordered table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>CT</th>
                    <th>Nombre</th>
                    <th>Email agente</th>
                    <th>Cédula A1</th>
                    <th>EFC</th>
                    <th>Proceso</th>
                    <th>Días CT</th>
                    <th className="col-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {candidatos.length === 0 ? (
                    <tr><td colSpan={8} className="text-center">No hay candidatos registrados.</td></tr>
                  ) : candidatos.map((c) => {
                    const { proceso, dias_desde_ct } = calcularDerivados({
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
                    const dias = dias_desde_ct
                    const etapas = c.etapas_completadas || {}
                    const allCompleted = [
                      'periodo_para_registro_y_envio_de_documentos',
                      'capacitacion_cedula_a1',
                      'periodo_para_ingresar_folio_oficina_virtual',
                      'periodo_para_playbook',
                      'pre_escuela_sesion_unica_de_arranque',
                      'fecha_limite_para_presentar_curricula_cdp',
                      'inicio_escuela_fundamental'
                    ].every(k => !!etapas[k]?.completed)
                    const isAgente = allCompleted
                    const procesoMostrar = isAgente ? 'Agente' : etiquetaProceso(proceso)
                    return (
                      <tr key={c.id_candidato}>
                        <td>{c.ct}</td>
                        <td>{c.candidato}</td>
                        <td>{(c as unknown as Record<string, unknown>).email_agente as string || ''}</td>
                        <td>{c.mes}</td>
                        <td>{c.efc}</td>
                        <td title={isAgente ? 'Agente' : proceso}>{procesoMostrar}</td>
                        <td>{dias ?? '—'}</td>
                        <td className="p-1">
                          <div className="d-flex flex-column flex-sm-row gap-1 stack-actions">
                            <Link href={`/candidatos/nuevo/${c.id_candidato}`} className="btn btn-primary btn-sm flex-fill">Editar</Link>
                            <button
                              onClick={() => {
                                // Siempre usar el valor más reciente del estado
                                const mensajes = fichaMensajes && typeof fichaMensajes === 'object' ? fichaMensajes : {};
                                console.log('[DEBUG] Exportando PDF para', c.candidato, 'con mensajes:', mensajes);
                                exportCandidatoPDF({ ...c, proceso }, { ...mensajes });
                              }}
                              className="btn btn-outline-secondary btn-sm flex-fill"
                              disabled={!mensajesCargados}
                            >
                              PDF
                            </button>
                            <button onClick={() => setPendingDelete(c)} className="btn btn-danger btn-sm flex-fill">Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
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
