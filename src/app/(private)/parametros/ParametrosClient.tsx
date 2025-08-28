"use client";
import { useEffect, useState } from 'react';

// Tipos para confirmación (export implícito dentro del archivo)
type Diff = { campo: string; antes: string; despues: string }
interface ConfirmBase<T> { tipo: 'mes' | 'efc'; id: number; original: T; edited: Partial<T>; diffs: Diff[] }
type ConfirmState = ConfirmBase<CedulaA1> | ConfirmBase<Efc>
const buildDiffs = (orig: unknown, edited: unknown): Diff[] => {
  if (!orig || typeof orig !== 'object' || !edited || typeof edited !== 'object') return []
  const o = orig as Record<string, unknown>
  const e = edited as Record<string, unknown>
  return Object.keys(e)
    .filter(k => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== e[k])
    .map(k => ({ campo: k, antes: String(o[k] ?? ''), despues: String(e[k] ?? '') }))
}
import BasePage from '@/components/BasePage';
import type { CedulaA1, Efc } from '@/types';
import { getCedulaA1, updateCedulaA1, getEfc, updateEfc } from '@/lib/api';
import AppModal from '@/components/ui/AppModal';

export default function ParametrosClient(){
  const [mesRows, setMesRows] = useState<CedulaA1[]>([]);
  const [editMesId, setEditMesId] = useState<number|null>(null);
  const [editMesRow, setEditMesRow] = useState<CedulaA1|null>(null);
  const [efcRows, setEfcRows] = useState<Efc[]>([]);
  const [editEfcId, setEditEfcId] = useState<number|null>(null);
  const [editEfcRow, setEditEfcRow] = useState<Partial<Efc>|null>(null);
  const [loading, setLoading] = useState(true);
  const [notif, setNotif] = useState<{msg:string; type:'success'|'danger'|'info'|'warning'}|null>(null);
  const [openMes, setOpenMes] = useState(false);
  const [openEfc, setOpenEfc] = useState(false);
  // Fase 2 metas
  const [openFase2,setOpenFase2]=useState(false)
  const [metaProspectos,setMetaProspectos]=useState<number|null>(null)
  const [metaCitas,setMetaCitas]=useState<number|null>(null)
  const [savingFase2,setSavingFase2]=useState(false)
  // Confirmación de guardado
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const loadAll = async () => {
    try {
      setLoading(true);
      const [mes, efc] = await Promise.all([getCedulaA1(), getEfc()]);
      setMesRows([...mes].sort((a,b)=>a.id - b.id));
      setEfcRows([...efc].sort((a,b)=>a.id - b.id));
      // Cargar fase2 metas
      try {
        const r = await fetch('/api/parametros?tipo=fase2')
        if(r.ok){
          const j = await r.json() as { success?:boolean; data?: Array<{id:number; clave?:string; valor?:string|number|null}> }
          const arr = j.data||[]
          const mp = arr.find(p=> p.clave==='meta_prospectos_semana')
          const mc = arr.find(p=> p.clave==='meta_citas_semana')
          if(mp) setMetaProspectos(Number(mp.valor)||null)
          if(mc) setMetaCitas(Number(mc.valor)||null)
        }
      } catch {}
    } catch (e){
      setNotif({msg: e instanceof Error? e.message : 'Error cargando parámetros', type:'danger'});
    } finally { setLoading(false); }
  };
  useEffect(()=>{ loadAll(); },[]);

  const onChangeEditMes = (e:React.ChangeEvent<HTMLInputElement>)=> setEditMesRow(r=> r? {...r,[e.target.name]:e.target.value}:r);
  const startEditMes = (r:CedulaA1)=>{ setEditMesId(r.id); setEditMesRow({...r}); };
  const openConfirmMes = ()=>{
    if(!editMesRow||editMesId==null) return;
    const original = mesRows.find(r=> r.id===editMesId);
    if(!original) return;
  const diffs = buildDiffs(original, editMesRow)
    if(diffs.length===0){ setNotif({msg:'Sin cambios', type:'info'}); return; }
    setConfirm({ tipo:'mes', id:editMesId, original, edited: editMesRow, diffs })
  }
  const executeSaveMes = async ()=>{
    if(!confirm||confirm.tipo!=='mes') return;
    try{
      await updateCedulaA1(confirm.id, confirm.edited);
      setMesRows(rows=> rows.map(r=> r.id===confirm.id ? { ...r, ...confirm.edited } : r));
      setNotif({msg:'MES actualizado', type:'success'});
    }catch(err){ setNotif({msg: err instanceof Error? err.message:'Error', type:'danger'}); }
    finally { setEditMesId(null); setEditMesRow(null); setConfirm(null); }
  }
  const saveEditMes = openConfirmMes;
  const cancelEditMes = ()=>{ setEditMesId(null); setEditMesRow(null); };

  const onChangeEditEfc = (e:React.ChangeEvent<HTMLInputElement>)=> setEditEfcRow(r=> r? {...r,[e.target.name]:e.target.value}:r);
  const startEditEfc = (r:Efc)=>{ setEditEfcId(r.id); setEditEfcRow({...r}); };
  const openConfirmEfc = ()=>{
    if(!editEfcRow||editEfcId==null) return;
    const original = efcRows.find(r=> r.id===editEfcId);
    if(!original) return;
  const diffs = buildDiffs(original, editEfcRow)
    if(diffs.length===0){ setNotif({msg:'Sin cambios', type:'info'}); return; }
    setConfirm({ tipo:'efc', id:editEfcId, original, edited: editEfcRow, diffs })
  }
  const executeSaveEfc = async ()=>{
    if(!confirm||confirm.tipo!=='efc') return;
    try{
      await updateEfc(confirm.id, confirm.edited);
      setEfcRows(rows=> rows.map(r=> r.id===confirm.id ? { ...r, ...confirm.edited } : r));
      setNotif({msg:'EFC actualizado', type:'success'});
    }catch(err){ setNotif({msg: err instanceof Error? err.message:'Error', type:'danger'}); }
    finally { setEditEfcId(null); setEditEfcRow(null); setConfirm(null); }
  }
  const saveEditEfc = openConfirmEfc;
  const cancelEditEfc = ()=>{ setEditEfcId(null); setEditEfcRow(null); };

  const saveFase2 = async()=>{
    if(metaProspectos==null || metaCitas==null){ setNotif({msg:'Complete ambos valores', type:'warning'}); return }
    setSavingFase2(true)
    try {
      // Obtener listado actual para IDs
      const r = await fetch('/api/parametros?tipo=fase2')
      const j = r.ok? await r.json(): {data:[]}
      const arr: Array<{id:number; clave?:string}> = j.data||[]
      const reqs: Promise<Response>[] = []
      const solicitante = 'sistema'
      const mp = arr.find(p=> p.clave==='meta_prospectos_semana')
      const mc = arr.find(p=> p.clave==='meta_citas_semana')
      if(mp) reqs.push(fetch('/api/parametros',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id: mp.id, valor:String(metaProspectos), solicitante })}))
      if(mc) reqs.push(fetch('/api/parametros',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id: mc.id, valor:String(metaCitas), solicitante })}))
      await Promise.all(reqs)
      setNotif({msg:'Metas fase 2 actualizadas', type:'success'})
    } catch {
      setNotif({msg:'Error guardando metas', type:'danger'})
    } finally { setSavingFase2(false) }
  }

  return (
    <BasePage title="Parámetros" alert={notif? {type: notif.type, message: notif.msg, show:true}: undefined}>
      {loading && <div className="text-center py-4"><div className="spinner-border" /></div>}
      {!loading && (
        <div className="d-flex flex-column gap-5">
          <section className="border rounded p-3 bg-white shadow-sm">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <button type="button" onClick={()=>setOpenMes(o=>!o)} aria-expanded={openMes} className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2">
                <i className={`bi bi-caret-${openMes? 'down':'right'}-fill`}></i>
                <span className="fw-bold small text-uppercase">Cédula A1 (MES)</span>
              </button>
              {openMes && (
                <span className="small text-muted">Edición</span>
              )}
            </div>
            {openMes && (
              <div className="table-responsive mt-3">
                <table className="table table-sm table-bordered align-middle mb-0 table-nowrap">
                  <thead className="table-light"><tr>
                    <th style={{width:160}}>MES</th>
                    <th>Periodo registro/envío doc</th>
                    <th>Capacitación A1</th>
                    <th style={{width:120}}>Acciones</th>
                  </tr></thead>
                  <tbody>
                    {mesRows.length===0 && (<tr><td colSpan={4} className="text-center small">Sin registros</td></tr>)}
                    {mesRows.map(r => (
                      <tr key={r.id}>
                        <td>{editMesId===r.id ? <input className="form-control form-control-sm" name="mes" value={editMesRow?.mes||''} onChange={onChangeEditMes} /> : r.mes}</td>
                        <td>{editMesId===r.id ? <input className="form-control form-control-sm" name="periodo_para_registro_y_envio_de_documentos" value={editMesRow?.periodo_para_registro_y_envio_de_documentos||''} onChange={onChangeEditMes} /> : (r.periodo_para_registro_y_envio_de_documentos || '')}</td>
                        <td>{editMesId===r.id ? <input className="form-control form-control-sm" name="capacitacion_cedula_a1" value={editMesRow?.capacitacion_cedula_a1||''} onChange={onChangeEditMes} /> : (r.capacitacion_cedula_a1 || '')}</td>
                        <td style={{whiteSpace:'nowrap'}}>
                          {editMesId===r.id ? (
                            <>
                              <button type="button" className="btn btn-success btn-sm me-1" onClick={saveEditMes}>Guardar</button>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEditMes}>Cancelar</button>
                            </>
                          ): (
                            <>
                              <button type="button" className="btn btn-primary btn-sm" onClick={()=>startEditMes(r)}>Editar</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="border rounded p-3 bg-white shadow-sm">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <button type="button" onClick={()=>setOpenEfc(o=>!o)} aria-expanded={openEfc} className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2">
                <i className={`bi bi-caret-${openEfc? 'down':'right'}-fill`}></i>
                <span className="fw-bold small text-uppercase">Escuela Fundamental de Carrera (EFC)</span>
              </button>
              {openEfc && (
                <span className="small text-muted">Edición</span>
              )}
            </div>
            {openEfc && (
              <div className="table-responsive mt-3">
                <table className="table table-sm table-bordered align-middle mb-0 table-nowrap">
                  <thead className="table-light"><tr>
                    <th>EFC</th>
                    <th>Periodo folio OV</th>
                    <th>Periodo playbook</th>
                    <th>Pre-escuela</th>
                    <th>Fecha límite CDP</th>
                    <th>Inicio fundamental</th>
                    <th style={{width:120}}>Acciones</th>
                  </tr></thead>
                  <tbody>
                    {efcRows.length===0 && (<tr><td colSpan={7} className="text-center small">Sin registros</td></tr>)}
                    {efcRows.map(r => (
                      <tr key={r.id}>
                        <td>{editEfcId===r.id ? <input className="form-control form-control-sm" name="efc" value={editEfcRow?.efc||''} onChange={onChangeEditEfc} /> : r.efc}</td>
                        <td>{editEfcId===r.id ? <input className="form-control form-control-sm" name="periodo_para_ingresar_folio_oficina_virtual" value={editEfcRow?.periodo_para_ingresar_folio_oficina_virtual||''} onChange={onChangeEditEfc} /> : r.periodo_para_ingresar_folio_oficina_virtual}</td>
                        <td>{editEfcId===r.id ? <input className="form-control form-control-sm" name="periodo_para_playbook" value={editEfcRow?.periodo_para_playbook||''} onChange={onChangeEditEfc} /> : r.periodo_para_playbook}</td>
                        <td>{editEfcId===r.id ? <input className="form-control form-control-sm" name="pre_escuela_sesion_unica_de_arranque" value={editEfcRow?.pre_escuela_sesion_unica_de_arranque||''} onChange={onChangeEditEfc} /> : r.pre_escuela_sesion_unica_de_arranque}</td>
                        <td>{editEfcId===r.id ? <input className="form-control form-control-sm" name="fecha_limite_para_presentar_curricula_cdp" value={editEfcRow?.fecha_limite_para_presentar_curricula_cdp||''} onChange={onChangeEditEfc} /> : r.fecha_limite_para_presentar_curricula_cdp}</td>
                        <td>{editEfcId===r.id ? <input className="form-control form-control-sm" name="inicio_escuela_fundamental" value={editEfcRow?.inicio_escuela_fundamental||''} onChange={onChangeEditEfc} /> : r.inicio_escuela_fundamental}</td>
                        <td style={{whiteSpace:'nowrap'}}>
                          {editEfcId===r.id ? (
                            <>
                              <button type="button" className="btn btn-success btn-sm me-1" onClick={saveEditEfc}>Guardar</button>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEditEfc}>Cancelar</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="btn btn-primary btn-sm" onClick={()=>startEditEfc(r)}>Editar</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
      <section className="border rounded p-3 bg-white shadow-sm mt-4">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <button type="button" onClick={()=>setOpenFase2(o=>!o)} aria-expanded={openFase2} className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2">
            <i className={`bi bi-caret-${openFase2? 'down':'right'}-fill`}></i>
            <span className="fw-bold small text-uppercase">Metas Fase 2</span>
          </button>
          {openFase2 && <span className="small text-muted">Prospectos y Citas</span>}
        </div>
        {openFase2 && (
          <div className="row g-3 mt-2 small">
            <div className="col-12 col-md-4 col-lg-3">
              <label className="form-label small mb-1">Meta prospectos / semana</label>
              <input type="number" className="form-control form-control-sm" value={metaProspectos??''} onChange={e=> setMetaProspectos(e.target.value? Number(e.target.value): null)} />
            </div>
            <div className="col-12 col-md-4 col-lg-3">
              <label className="form-label small mb-1">Meta citas / semana</label>
              <input type="number" className="form-control form-control-sm" value={metaCitas??''} onChange={e=> setMetaCitas(e.target.value? Number(e.target.value): null)} />
            </div>
            <div className="col-12 col-md-4 col-lg-3 d-flex align-items-end">
              <button type="button" className="btn btn-primary btn-sm" disabled={savingFase2} onClick={saveFase2}>{savingFase2? 'Guardando...':'Guardar metas'}</button>
            </div>
          </div>
        )}
      </section>
      {confirm && (
        <ConfirmModal confirm={confirm} onCancel={()=> setConfirm(null)} onConfirm={confirm.tipo==='mes'? executeSaveMes : executeSaveEfc} />
      )}
    </BasePage>
  );
}
// Modal de confirmación
function ConfirmModal({ confirm, onCancel, onConfirm }:{ confirm: ConfirmState; onCancel: ()=>void; onConfirm: ()=>void }) {
  const titulo = confirm.tipo==='mes'
    ? `Cambios MES: ${(confirm.original as CedulaA1).mes}`
    : `Cambios EFC: ${(confirm.original as Efc).efc}`
  return (
    <AppModal
      title={titulo}
      icon="pencil-square"
      width={700}
      onClose={onCancel}
      footer={<>
        <button type="button" className="btn btn-soft-secondary btn-sm" onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn btn-success btn-sm d-flex align-items-center gap-2" onClick={onConfirm}>
          <i className="bi bi-check-lg"></i>
          Confirmar
        </button>
      </>}
    >
      <p className="small text-muted mb-2">Revisa los valores que se actualizarán.</p>
      <div className="table-responsive" style={{maxHeight:300}}>
        <table className="table table-sm table-bordered align-middle mb-0">
          <thead className="table-light">
            <tr><th>Campo</th><th>Actual</th><th>Nuevo</th></tr>
          </thead>
          <tbody>
            {confirm.diffs.map((d: Diff)=> (
              <tr key={d.campo}>
                <td className="small fw-semibold" style={{whiteSpace:'nowrap'}}>{d.campo}</td>
                <td className="small" style={{whiteSpace:'nowrap'}}>{d.antes}</td>
                <td className="small text-primary" style={{whiteSpace:'nowrap'}}>{d.despues}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppModal>
  )
}
