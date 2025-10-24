"use client";
import { useEffect, useMemo, useState } from 'react';

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
import type { AgendaDeveloper, CedulaA1, Efc, IntegrationProviderKey, ProductoParametro, TipoProducto, MonedaPoliza, Parametro } from '@/types';
// Campos posibles para ficha de candidato (deben coincidir con los usados en el PDF)
const FICHA_CAMPOS = [
  'CLAVE TEMPORAL',
  'NOMBRE DE CANDIDATO',
  'POP',
  'EMAIL DE AGENTE',
  'FECHA DE CREACIÓN CLAVE TEMPORAL',
  'FECHA DE CREACIÓN POP',
  'DÍAS DESDE CREACIÓN CT',
  'DÍAS DESDE CREACIÓN POP',
  'CÉDULA A1',
  'PERIODO PARA REGISTRO Y ENVÍO DE DOCUMENTOS',
  'CAPACITACIÓN A1',
  'FECHA TENT. EXAMEN',
  'EFC',
  'PERÍODO FOLIO OFICINA VIRTUAL',
  'PERÍODO PLAYBOOK',
  'PRE-ESCUELA SESIÓN ARRANQUE',
  'FECHA LÍMITE CURRICULA CDP',
  'INICIO ESCUELA FUNDAMENTAL',
  'SEGURO GMM',
  'SEGURO VIDA',
  'FECHA DE CREACION DE CANDIDATO',
  'ULTIMA ACTUALIZACIÓN DE CANDIDATO',
];
import { getCedulaA1, updateCedulaA1, getEfc, updateEfc, getProductoParametros, createProductoParametro, updateProductoParametro, deleteProductoParametro, getAgendaDevelopers, updateAgendaDevelopers } from '@/lib/api';

const INTEGRATION_LABELS: Record<IntegrationProviderKey, string> = {
  google: 'Google Meet',
  zoom: 'Zoom personal',
  teams: 'Microsoft Teams'
};
import AppModal from '@/components/ui/AppModal';
import { useDialog } from '@/components/ui/DialogProvider';

export default function ParametrosClient(){
  // Modal añadir mensaje ficha_candidato
  const [showAddFicha, setShowAddFicha] = useState(false);
  const [newFicha, setNewFicha] = useState<{clave: string; valor: string; descripcion?: string}>({ clave:'', valor:'', descripcion:'' });
  const handleAddFichaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setNewFicha(f => ({ ...f, [e.target.name]: e.target.value }));
  };
  const handleAddFicha = async () => {
    if (!newFicha.clave || !newFicha.valor) return;
    try {
      const res = await fetch('/api/parametros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'ficha_candidato', clave: newFicha.clave, valor: newFicha.valor, descripcion: newFicha.descripcion, solicitante: 'admin' })
      });
      if (res.ok) {
        setShowAddFicha(false);
        setNewFicha({ clave:'', valor:'', descripcion:'' });
        const ref = await fetch('/api/parametros?tipo=ficha_candidato&ts=' + Date.now());
        if (ref.ok) {
          const j = await ref.json();
          setFichaRows(j.data || []);
        }
        setNotif({ msg: 'Mensaje añadido', type: 'success' });
      } else {
        setNotif({ msg: 'Error al añadir', type: 'danger' });
      }
    } catch { setNotif({ msg: 'Error', type: 'danger' }); }
  };
  // FICHA CANDIDATO
  const [fichaRows, setFichaRows] = useState<Parametro[]>([]);
  const [editFichaId, setEditFichaId] = useState<number|null>(null);
  const [editFichaRow, setEditFichaRow] = useState<Partial<Parametro>|null>(null);
  const [openFicha, setOpenFicha] = useState(false);
  const dialog = useDialog();
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
  const [openProductos, setOpenProductos] = useState(false);
  const [openAgenda, setOpenAgenda] = useState(true);
  const [developers, setDevelopers] = useState<AgendaDeveloper[]>([]);
  const [loadingDevelopers, setLoadingDevelopers] = useState(false);
  const [developerSearch, setDeveloperSearch] = useState('');
  const [developerError, setDeveloperError] = useState<string|null>(null);
  const [togglingId, setTogglingId] = useState<number|null>(null);
  // Productos (Fase 3)
  const [productos, setProductos] = useState<ProductoParametro[]>([])
  const [editProdId, setEditProdId] = useState<string|null>(null)
  const [editProd, setEditProd] = useState<Partial<ProductoParametro>|null>(null)
  const [editCondExpr, setEditCondExpr] = useState<string>('')
  const [newCondExpr, setNewCondExpr] = useState<string>('')
  type Op = '<' | '<=' | '>' | '>='
  const [newProd, setNewProd] = useState<Partial<ProductoParametro>>({ activo:true, puntos_multiplicador:1, tipo_producto:'VI', nombre_comercial:'' })
  const [savingProdEdit, setSavingProdEdit] = useState(false)
  const [savingProdNew, setSavingProdNew] = useState(false)
  // Fase 2 metas
  const [openFase2,setOpenFase2]=useState(false)
  const [metaProspectos,setMetaProspectos]=useState<number|null>(null)
  const [metaCitas,setMetaCitas]=useState<number|null>(null)
  const [savingFase2,setSavingFase2]=useState(false)
  // Confirmación de guardado
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const loadDevelopers = async () => {
    setLoadingDevelopers(true)
    setDeveloperError(null)
    try {
      const list = await getAgendaDevelopers()
      setDevelopers(list)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar los usuarios'
      setDeveloperError(message)
      setNotif({ msg: message, type: 'danger' })
    } finally {
      setLoadingDevelopers(false)
    }
  }

  const handleToggleDeveloper = async (dev: AgendaDeveloper) => {
    setTogglingId(dev.id)
    try {
      const updated = await updateAgendaDevelopers({ usuarioId: dev.id, isDesarrollador: !dev.is_desarrollador })
      setDevelopers(updated)
      setNotif({ msg: !dev.is_desarrollador ? 'Usuario marcado como desarrollador' : 'Usuario removido como desarrollador', type: 'success' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar el cambio'
      setNotif({ msg: message, type: 'danger' })
    } finally {
      setTogglingId(null)
    }
  }

  const filteredDevelopers = useMemo(() => {
    const term = developerSearch.trim().toLowerCase()
    if (!term) return developers
    return developers.filter((dev) => {
      const haystack = [dev.email, dev.nombre || '', dev.rol]
      return haystack.some((value) => value?.toLowerCase().includes(term))
    })
  }, [developers, developerSearch])

  const loadAll = async () => {
    try {
      setLoading(true);
  const [mes, efc, prods] = await Promise.all([getCedulaA1(), getEfc(), getProductoParametros({ includeInactivos: true })]);
      setMesRows([...mes].sort((a,b)=>a.id - b.id));
      setEfcRows([...efc].sort((a,b)=>a.id - b.id));
  setProductos([...prods]);
      await loadDevelopers();
      // Cargar mensajes ficha_candidato
      try {
        const r = await fetch('/api/parametros?tipo=ficha_candidato');
        if(r.ok){
          const j = await r.json() as { success?:boolean; data?: Parametro[] };
          setFichaRows(j.data||[]);
        }
      } catch {}
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
  // Edición en línea ficha_candidato

  // ...otras funciones y hooks...

  // Declarar funciones justo antes del JSX de la tabla para asegurar visibilidad
  // Sección FICHA CANDIDATO
  // ---

  // ...otras funciones y hooks...


  // Declarar handlers edición ficha_candidato justo antes del return para asegurar visibilidad en JSX
  // ---
  // (Eliminado: duplicado, handlers ficha_candidato solo deben estar antes del return)
  // (Eliminado: duplicado, handlers ficha_candidato solo deben estar antes del return)
    } catch (e){
      setNotif({msg: e instanceof Error? e.message : 'Error cargando parámetros', type:'danger'});
    } finally { setLoading(false); }
  };
  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Handlers productos
  const formatCondExpr = (p: Partial<ProductoParametro>): string => {
    const fmtNum = (n: number)=> n.toLocaleString('es-MX')
    if (p.sa_min!=null || p.sa_max!=null) {
      if (p.sa_min!=null && p.sa_max==null) return `>= ${fmtNum(Number(p.sa_min))}`
      if (p.sa_max!=null && p.sa_min==null) return `< ${fmtNum(Number(p.sa_max))}`
      if (p.sa_min!=null && p.sa_max!=null) return `>= ${fmtNum(Number(p.sa_min))} y <= ${fmtNum(Number(p.sa_max))}`
    }
    if (p.edad_min!=null || p.edad_max!=null) {
  if (p.edad_min!=null && p.edad_max==null) return `> ${Number(p.edad_min)} años`
  if (p.edad_max!=null && p.edad_min==null) return `<= ${Number(p.edad_max)} años`
  if (p.edad_min!=null && p.edad_max!=null) return `> ${Number(p.edad_min)} años y <= ${Number(p.edad_max)} años`
    }
    return ''
  }
  const parseCondExpr = (expr: string): Partial<ProductoParametro> => {
    const out: Partial<ProductoParametro> = {}
    if (!expr) return out
    const re = /(<=|>=|<|>)\s*([\d.,]+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(expr)) !== null) {
      const op = m[1] as Op
      const raw = m[2]
      const num = Number(raw.replace(/\./g,'').replace(/,/g,''))
      if (!isFinite(num)) continue
      const isAge = num <= 200 && !raw.includes(',') && num < 1000
      if (isAge) {
        if (op === '<' || op === '<=') { out.edad_max = num; out.condicion_edad_tipo = op }
        else { out.edad_min = num; out.condicion_edad_tipo = op }
      } else {
        if (op === '<' || op === '<=') { out.sa_max = num; out.condicion_sa_tipo = op }
        else { out.sa_min = num; out.condicion_sa_tipo = op }
      }
    }
    return out
  }
  const startEditProd = (p: ProductoParametro)=>{ setEditProdId(p.id); setEditProd({ ...p }); setEditCondExpr(formatCondExpr(p)) }
  const cancelEditProd = ()=>{ setEditProdId(null); setEditProd(null) }
  const onChangeEditProd = (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=> setEditProd(prev=> {
    if(!prev) return prev
    const name = e.target.name
    const val = (e.target as HTMLInputElement).type === 'number'
      ? (e.target.value === '' ? null : Number(e.target.value))
      : (e.target.value === '' ? null : e.target.value)
    // Clamp 0-100 for percent fields
    const isPercent = /^anio_([1-9]|10|11)_/.test(name)
    const clamped = (isPercent && typeof val === 'number') ? Math.max(0, Math.min(100, val)) : val
    return { ...prev, [name]: clamped }
  })
  const onChangeNewProd = (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=> setNewProd(prev=> {
    const name = e.target.name
    const val = (e.target as HTMLInputElement).type === 'number'
      ? (e.target.value === '' ? null : Number(e.target.value))
      : (e.target.value === '' ? null : e.target.value)
    return { ...prev, [name]: val }
  })
  const saveEditProd = async ()=>{
    if(!editProdId||!editProd) return
    try {
  setSavingProdEdit(true)
      // Round percent fields to 2 decimals before sending
      const payload: Partial<ProductoParametro> = { ...editProd }
      type AnioKey = `anio_${1|2|3|4|5|6|7|8|9|10}_percent`
      for (const n of [1,2,3,4,5,6,7,8,9,10] as const) {
        const key = `anio_${n}_percent` as AnioKey
        const v = (payload as Partial<Record<AnioKey, number|null>>)[key]
        if (typeof v === 'number') (payload as Partial<Record<AnioKey, number|null>>)[key] = Number(v.toFixed(2))
      }
      if (typeof payload.anio_11_plus_percent === 'number') payload.anio_11_plus_percent = Number(payload.anio_11_plus_percent.toFixed(2))
      // Mapear expresión SA/Edad a campos (vacío => limpia)
      const exprTrim = (editCondExpr||'').trim()
      const parsed = parseCondExpr(exprTrim)
      if (exprTrim === '') {
        payload.condicion_sa_tipo = null
        payload.sa_min = null
        payload.sa_max = null
        payload.condicion_edad_tipo = null
        payload.edad_min = null
        payload.edad_max = null
      } else {
        payload.condicion_sa_tipo = (parsed.condicion_sa_tipo as string|undefined) ?? null
        payload.sa_min = (parsed.sa_min as number|undefined) ?? null
        payload.sa_max = (parsed.sa_max as number|undefined) ?? null
        payload.condicion_edad_tipo = (parsed.condicion_edad_tipo as string|undefined) ?? null
        payload.edad_min = (parsed.edad_min as number|undefined) ?? null
        payload.edad_max = (parsed.edad_max as number|undefined) ?? null
      }
      const upd = await updateProductoParametro(editProdId, payload)
      setProductos(list=> list.map(p=> p.id===upd.id? upd: p))
      setNotif({msg:'Producto actualizado', type:'success'})
    } catch(e){ setNotif({msg: e instanceof Error? e.message: 'Error', type:'danger'}) } finally { setSavingProdEdit(false); cancelEditProd() }
  }
  const addNewProd = async ()=>{
    if(!newProd.nombre_comercial || !newProd.tipo_producto){ setNotif({msg:'Completa al menos nombre y tipo', type:'warning'}); return }
    try {
      setSavingProdNew(true)
      // normaliza tipos
  const payload: Partial<ProductoParametro> = { ...newProd }
  const parsed = parseCondExpr((newCondExpr||'').trim())
  payload.condicion_sa_tipo = (parsed.condicion_sa_tipo as string|undefined) ?? null
  payload.sa_min = (parsed.sa_min as number|undefined) ?? null
  payload.sa_max = (parsed.sa_max as number|undefined) ?? null
  payload.condicion_edad_tipo = (parsed.condicion_edad_tipo as string|undefined) ?? null
  payload.edad_min = (parsed.edad_min as number|undefined) ?? null
  payload.edad_max = (parsed.edad_max as number|undefined) ?? null
      const created = await createProductoParametro(payload)
      setProductos(list=> [created, ...list])
  setNewProd({ activo:true, puntos_multiplicador:1, tipo_producto:'VI', nombre_comercial:'' })
  setNewCondExpr('')
      setNotif({msg:'Producto creado', type:'success'})
  } catch(e){ setNotif({msg: e instanceof Error? e.message: 'Error', type:'danger'}) } finally { setSavingProdNew(false) }
  }
  const removeProd = async (id: string)=>{
    const ok = await dialog.confirm(`¿Inhabilitar la variante de producto?`, { icon: 'exclamation-triangle-fill', confirmText: 'Inhabilitar' })
    if(!ok) return
    try {
      const res = await deleteProductoParametro(id)
      const data = res?.data
      if (data) {
        setProductos(list=> list.map(p=> p.id===data.id? data: p))
      } else {
        setProductos(list=> list.map(p=> p.id===id ? { ...p, activo: false } : p))
      }
      setNotif({msg:'Producto marcado como inactivo', type:'success'})
    } catch(e){ setNotif({msg: e instanceof Error? e.message: 'Error', type:'danger'}) }
  }

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
  setNotif({msg:'Metas actualizadas', type:'success'})
      // Si faltaba alguno lo creamos (seed dinámico)
      if(!mp){
        await fetch('/api/parametros',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ tipo:'fase2', clave:'meta_prospectos_semana', valor:String(metaProspectos), solicitante })})
      }
      if(!mc){
        await fetch('/api/parametros',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ tipo:'fase2', clave:'meta_citas_semana', valor:String(metaCitas), solicitante })})
      }
      // Refrescar tras guardar/crear
      try {
        const ref = await fetch('/api/parametros?tipo=fase2&ts='+Date.now())
        if(ref.ok){
          const jr = await ref.json() as { data?: Array<{clave?:string; valor?:string|number|null}> }
          const arr2 = jr.data||[]
          const nmp = arr2.find(p=> p.clave==='meta_prospectos_semana')
          const nmc = arr2.find(p=> p.clave==='meta_citas_semana')
          if(nmp) setMetaProspectos(Number(nmp.valor)||null)
          if(nmc) setMetaCitas(Number(nmc.valor)||null)
        }
      } catch {}
    } catch {
      setNotif({msg:'Error guardando metas', type:'danger'})
    } finally { setSavingFase2(false) }
  }

  // Handlers edición en línea ficha_candidato (deben estar justo antes del return para estar en scope del JSX)
  const startEditFicha = (r: Parametro) => { setEditFichaId(r.id); setEditFichaRow({ ...r }); };
  const onChangeEditFicha = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setEditFichaRow(r => r ? { ...r, [e.target.name]: e.target.value } : r);
  };
  const saveEditFicha = async () => {
    if (!editFichaRow || editFichaId == null) return;
    try {
      const res = await fetch('/api/parametros', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editFichaId, clave: editFichaRow.clave, valor: editFichaRow.valor, descripcion: editFichaRow.descripcion, solicitante: 'admin' })
      });
      if (res.ok) {
        // Refrescar desde backend para asegurar persistencia real
        const ref = await fetch('/api/parametros?tipo=ficha_candidato&ts=' + Date.now());
        if (ref.ok) {
          const j = await ref.json();
          setFichaRows(j.data || []);
        }
        setNotif({ msg: 'Mensaje actualizado', type: 'success' });
      } else {
        setNotif({ msg: 'Error al guardar', type: 'danger' });
      }
    } catch { setNotif({ msg: 'Error', type: 'danger' }); }
    finally { setEditFichaId(null); setEditFichaRow(null); }
  };
  const cancelEditFicha = () => { setEditFichaId(null); setEditFichaRow(null); };

  return (
    <BasePage title="Parámetros" alert={notif? {type: notif.type, message: notif.msg, show:true}: undefined}>
      {loading && <div className="text-center py-4"><div className="spinner-border" /></div>}
      {!loading && (
        <div className="d-flex flex-column gap-5">
          <section className="border rounded p-3 bg-white shadow-sm">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setOpenAgenda((o) => !o)}
                aria-expanded={openAgenda}
                className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2"
              >
                <i className={`bi bi-caret-${openAgenda ? 'down' : 'right'}-fill`}></i>
                <span className="fw-bold small text-uppercase">Agenda interna · desarrolladores</span>
              </button>
              {openAgenda && (
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-muted">Controla quién puede acompañar citas y con qué proveedores</span>
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={loadDevelopers} disabled={loadingDevelopers}>
                    {loadingDevelopers ? 'Cargando…' : 'Refrescar'}
                  </button>
                </div>
              )}
            </div>
            {openAgenda && (
              <>
                <div className="row g-3 mt-3">
                  <div className="col-12 col-md-6 col-lg-4">
                    <label className="form-label small mb-1">Buscar</label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Nombre, correo o rol"
                      value={developerSearch}
                      onChange={(e) => setDeveloperSearch(e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-lg-8">
                    <div className="alert alert-info small mb-0">
                      Marca como <strong>desarrolladores</strong> a los usuarios que necesites designar como acompañantes.
                    </div>
                  </div>
                </div>
                {developerError && (
                  <div className="alert alert-danger small mt-3 mb-0" role="alert">
                    {developerError}
                  </div>
                )}
                <div className="table-responsive mt-3" style={{ maxHeight: 420 }}>
                  <table className="table table-sm align-middle table-hover">
                    <thead className="table-light">
                      <tr>
                        <th>Usuario</th>
                        <th className="text-center">Rol</th>
                        <th className="text-center">Desarrollador</th>
                        <th className="text-center">Integraciones</th>
                        <th style={{ width: 120 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingDevelopers && (
                        <tr>
                          <td colSpan={5} className="text-center text-muted small py-4">Cargando usuarios…</td>
                        </tr>
                      )}
                      {!loadingDevelopers && filteredDevelopers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center text-muted small py-4">Sin resultados</td>
                        </tr>
                      )}
                      {!loadingDevelopers &&
                        filteredDevelopers.map((dev) => (
                          <tr key={dev.id}>
                            <td>
                              <div className="fw-semibold">{dev.nombre || dev.email}</div>
                              <div className="text-muted small">{dev.email}</div>
                              {!dev.activo && (
                                <span className="badge bg-warning-subtle text-warning border border-warning-subtle mt-1">Inactivo</span>
                              )}
                            </td>
                            <td className="text-center small">{dev.rol}</td>
                            <td className="text-center">
                              {dev.is_desarrollador ? (
                                <span className="badge bg-primary-subtle text-primary">Sí</span>
                              ) : (
                                <span className="badge bg-secondary-subtle text-secondary">No</span>
                              )}
                            </td>
                            <td className="text-center small">
                              {dev.tokens.length > 0 ? (
                                <div className="d-flex flex-wrap gap-1 justify-content-center">
                                  {dev.tokens.map((token) => (
                                    <span key={token} className="badge bg-success-subtle text-success border border-success-subtle">
                                      {INTEGRATION_LABELS[token] || token}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td className="text-end">
                              <button
                                type="button"
                                className={`btn btn-sm ${dev.is_desarrollador ? 'btn-outline-danger' : 'btn-outline-success'}`}
                                onClick={() => handleToggleDeveloper(dev)}
                                disabled={togglingId === dev.id}
                              >
                                {togglingId === dev.id ? 'Guardando…' : dev.is_desarrollador ? 'Quitar' : 'Marcar'}
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

              </>
            )}
          </section>

          {/* Sección FICHA CANDIDATO */}
          <section className="border rounded p-3 bg-white shadow-sm">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div className="d-flex align-items-center gap-2">
                <button type="button" onClick={()=>setOpenFicha(o=>!o)} aria-expanded={openFicha} className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2">
                  <i className={`bi bi-caret-${openFicha? 'down':'right'}-fill`}></i>
                  <span className="fw-bold small text-uppercase">Mensajes ficha de candidato</span>
                </button>
                {openFicha && <span className="small text-muted">Edición en línea</span>}
              </div>
              {openFicha && (
                <button type="button" className="btn btn-success btn-sm" onClick={()=>setShowAddFicha(true)}>
                  <i className="bi bi-plus-lg"></i> Añadir mensaje
                </button>
              )}
            </div>
            {openFicha && (
              <>
                {showAddFicha && (
                  <AppModal title="Añadir mensaje ficha de candidato" icon="plus-lg" width={500} onClose={()=>setShowAddFicha(false)}
                    footer={<>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={()=>setShowAddFicha(false)}>Cancelar</button>
                      <button type="button" className="btn btn-primary btn-sm ms-2" disabled={!newFicha.clave || !newFicha.valor} onClick={handleAddFicha}>
                        <i className="bi bi-check-lg"></i> Guardar
                      </button>
                    </>}
                  >
                    <div className="mb-3">
                      <label className="form-label small mb-1">Campo/Fila</label>
                      <select className="form-select form-select-sm" name="clave" value={newFicha.clave} onChange={handleAddFichaChange}>
                        <option value="">(Selecciona campo)</option>
                        {FICHA_CAMPOS.map(campo => <option key={campo} value={campo}>{campo}</option>)}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label small mb-1">Mensaje</label>
                      <input className="form-control form-control-sm" name="valor" value={newFicha.valor} onChange={handleAddFichaChange} />
                    </div>
                    <div className="mb-2">
                      <label className="form-label small mb-1">Descripción (opcional)</label>
                      <input className="form-control form-control-sm" name="descripcion" value={newFicha.descripcion||''} onChange={handleAddFichaChange} />
                    </div>
                  </AppModal>
                )}
                <div className="table-responsive mt-3">
                <table className="table table-sm table-bordered align-middle mb-0 table-nowrap">
                  <thead className="table-light"><tr>
                    <th style={{width:220}}>Campo/Fila</th>
                    <th>Mensaje</th>
                    <th>Descripción</th>
                    <th style={{width:120}}>Acciones</th>
                  </tr></thead>
                  <tbody>
                    {fichaRows.length===0 && (<tr><td colSpan={4} className="text-center small">Sin mensajes</td></tr>)}
                    {fichaRows.map(r => (
                      <tr key={r.id}>
                        <td>{editFichaId===r.id ? (
                          <select className="form-select form-select-sm" name="clave" value={editFichaRow?.clave||''} onChange={onChangeEditFicha}>
                            <option value="">(Selecciona campo)</option>
                            {FICHA_CAMPOS.map(campo => <option key={campo} value={campo}>{campo}</option>)}
                          </select>
                        ) : r.clave}
                        </td>
                        <td>{editFichaId===r.id ? (
                          <input className="form-control form-control-sm" name="valor" value={typeof editFichaRow?.valor === 'string' || typeof editFichaRow?.valor === 'number' ? editFichaRow.valor : ''} onChange={onChangeEditFicha} />
                        ) : r.valor}</td>
                        <td>{editFichaId===r.id ? (
                          <input className="form-control form-control-sm" name="descripcion" value={editFichaRow?.descripcion||''} onChange={onChangeEditFicha} />
                        ) : r.descripcion}</td>
                        <td style={{whiteSpace:'nowrap'}}>
                          {editFichaId===r.id ? (
                            <>
                              <button type="button" className="btn btn-success btn-sm me-1" onClick={saveEditFicha}>Guardar</button>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEditFicha}>Cancelar</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="btn btn-primary btn-sm me-1" onClick={()=>startEditFicha(r)}>Editar</button>
                              <button type="button" className="btn btn-danger btn-sm" onClick={async()=>{
                                if(await dialog.confirm('¿Seguro que deseas eliminar este mensaje?')){
                                  try {
                                    const res = await fetch('/api/parametros', {
                                      method: 'DELETE',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: r.id, solicitante: 'admin' })
                                    });
                                    if(res.ok){
                                      setFichaRows(f=>f.filter(x=>x.id!==r.id));
                                      setNotif({ msg: 'Mensaje eliminado', type: 'success' });
                                    } else {
                                      setNotif({ msg: 'Error al eliminar', type: 'danger' });
                                    }
                                  } catch { setNotif({ msg: 'Error', type: 'danger' }); }
                                }
                              }}>
                                Eliminar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </section>
          <section className="border rounded p-3 bg-white shadow-sm">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <button type="button" onClick={()=>setOpenProductos(o=>!o)} aria-expanded={openProductos} className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2">
                <i className={`bi bi-caret-${openProductos? 'down':'right'}-fill`}></i>
                <span className="fw-bold small text-uppercase">Productos parametrizados</span>
              </button>
              {openProductos && (
                <span className="small text-muted">Variantes y porcentajes por año</span>
              )}
            </div>
            {openProductos && (
              <div className="mt-3">
                <div className="border rounded p-2 mb-3 bg-light">
                  <div className="row g-2 align-items-end">
                    <div className="col-12 col-md-3">
                      <label className="form-label small mb-1">Nombre comercial</label>
                      <input name="nombre_comercial" value={newProd.nombre_comercial||''} onChange={onChangeNewProd} className="form-control form-control-sm" />
                    </div>
                    <div className="col-6 col-md-2">
                      <label className="form-label small mb-1">Tipo</label>
                      <select name="tipo_producto" value={newProd.tipo_producto as TipoProducto} onChange={onChangeNewProd} className="form-select form-select-sm">
                        <option value="VI">VI</option>
                        <option value="GMM">GMM</option>
                      </select>
                    </div>
                    <div className="col-6 col-md-2">
                      <label className="form-label small mb-1">Moneda</label>
                      <select name="moneda" value={(newProd.moneda||'') as MonedaPoliza|''} onChange={onChangeNewProd} className="form-select form-select-sm">
                        <option value="">Cualquiera</option>
                        <option value="MXN">MXN</option>
                        <option value="USD">USD</option>
                        <option value="UDI">UDI</option>
                      </select>
                    </div>
                    <div className="col-6 col-md-2">
                      <label className="form-label small mb-1">Duración (años)</label>
                      <input name="duracion_anios" value={newProd.duracion_anios??''} onChange={onChangeNewProd} type="number" className="form-control form-control-sm" />
                    </div>
                    <div className="col-12 col-md-3">
                      <label className="form-label small mb-1">Suma Asegurada (SA)</label>
                      <input value={newCondExpr} onChange={e=> setNewCondExpr(e.target.value)} className="form-control form-control-sm" placeholder=">= 500,000 | < 1,500,000 | <=45 años | >65 años" />
                      <div className="form-text">Acepta formatos: &quot;&lt; 500,000&quot;, &quot;&gt;= 1,500,000&quot;, &quot;&lt;=45 años&quot;, &quot;&gt;65 años&quot;</div>
                    </div>
                    <div className="col-12 col-md-2 d-grid">
                      <button type="button" onClick={addNewProd} disabled={savingProdNew} className="btn btn-primary btn-sm">{savingProdNew? 'Agregando…':'Agregar'}</button>
                    </div>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table table-sm table-bordered align-middle mb-0 table-nowrap">
          <thead className="table-light">
                      <tr>
            <th>Producto</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Moneda</th>
            <th>Duración (años)</th>
            <th>Suma Asegurada (SA)</th>
            <th>AÑO 1 (%)</th>
            <th>AÑO 2 (%)</th>
            <th>AÑO 3 (%)</th>
            <th>AÑO 4 (%)</th>
            <th>AÑO 5 (%)</th>
            <th>AÑO 6 (%)</th>
            <th>AÑO 7 (%)</th>
            <th>AÑO 8 (%)</th>
            <th>AÑO 9 (%)</th>
            <th>AÑO 10 (%)</th>
            <th>AÑO 11+ (%)</th>
                        <th style={{width:150}}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productos.length===0 && (<tr><td colSpan={18} className="text-center small">Sin variantes</td></tr>)}
                      {productos.map(p=> (
                        <tr key={p.id} className={p.activo === false ? 'table-secondary' : undefined}>
                          <td>{p.nombre_comercial}</td>
                          <td>{p.tipo_producto}</td>
                          <td>
                            <span className={`badge ${p.activo === false ? 'text-bg-secondary' : 'text-bg-success'}`}>
                              {p.activo === false ? 'Inactivo' : 'Activo'}
                            </span>
                          </td>
                          <td>{p.moneda||''}</td>
                          <td>{p.duracion_anios??''}</td>
                          <td>{formatCondExpr(p)}</td>
              {([1,2,3,4,5,6,7,8,9,10] as const).map(n=> {
                            type AnioKey = `anio_${1|2|3|4|5|6|7|8|9|10}_percent`
                            const key = `anio_${n}_percent` as AnioKey
                            const val = ((p as unknown) as Record<string, unknown>)[key] as number | null | undefined
                            return (
                              <td key={n}>{val!=null? `${Number(val).toFixed(2)}%` : ''}</td>
                            )
                          })}
                          <td>{p.anio_11_plus_percent!=null? `${Number(p.anio_11_plus_percent).toFixed(2)}%` : ''}</td>
                          <td style={{whiteSpace:'nowrap'}}>
                            <>
                              <button type="button" className="btn btn-primary btn-sm me-1" onClick={()=>startEditProd(p)}>Editar</button>
                              <button type="button" className="btn btn-outline-danger btn-sm" disabled={p.activo === false} onClick={()=>removeProd(p.id)}>
                                {p.activo === false ? 'Inactivo' : 'Inactivar'}
                              </button>
                            </>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Modal de edición de producto */}
                {editProdId && editProd && (
                  <AppModal
                    title={`Editar producto: ${editProd.nombre_comercial || ''}`}
                    icon="pencil-square"
                    width={900}
                    onClose={cancelEditProd}
          footer={
                      <>
            <button type="button" className="btn btn-soft-secondary btn-sm" onClick={cancelEditProd} disabled={savingProdEdit}>Cancelar</button>
            <button type="button" className="btn btn-success btn-sm" onClick={saveEditProd} disabled={savingProdEdit}>{savingProdEdit? 'Guardando…':'Guardar'}</button>
                      </>
                    }
                  >
                    <div className="container-fluid small">
                      <div className="row g-2">
                        <div className="col-12 col-md-6">
                          <label className="form-label small mb-1">Nombre comercial</label>
                          <input name="nombre_comercial" value={editProd.nombre_comercial ?? ''} onChange={onChangeEditProd} className="form-control form-control-sm" />
                        </div>
                        <div className="col-6 col-md-3">
                          <label className="form-label small mb-1">Tipo</label>
                          <select name="tipo_producto" value={(editProd.tipo_producto as TipoProducto) || 'VI'} onChange={onChangeEditProd} className="form-select form-select-sm">
                            <option value="VI">VI</option>
                            <option value="GMM">GMM</option>
                          </select>
                        </div>
                        <div className="col-6 col-md-3">
                          <label className="form-label small mb-1">Moneda</label>
                          <select name="moneda" value={(editProd.moneda as MonedaPoliza) || ''} onChange={onChangeEditProd} className="form-select form-select-sm">
                            <option value="">Cualquiera</option>
                            <option value="MXN">MXN</option>
                            <option value="USD">USD</option>
                            <option value="UDI">UDI</option>
                          </select>
                        </div>
                        <div className="col-6 col-md-3">
                          <label className="form-label small mb-1">Duración (años)</label>
                          <input name="duracion_anios" type="number" value={editProd.duracion_anios ?? ''} onChange={onChangeEditProd} className="form-control form-control-sm" />
                        </div>
                        <div className="col-12 col-md-3">
                          <label className="form-label small mb-1">Suma Asegurada (SA)</label>
                          <input value={editCondExpr} onChange={e=> setEditCondExpr(e.target.value)} className="form-control form-control-sm" placeholder=">= 500,000 | < 1,500,000 | <=45 años | >65 años" />
                          <div className="form-text">Acepta formatos: &quot;&lt; 500,000&quot;, &quot;&gt;= 1,500,000&quot;, &quot;&lt;=45 años&quot;, &quot;&gt;65 años&quot;</div>
                        </div>
                      </div>
                      <hr />
                      <div className="row g-2">
                        {([1,2,3,4,5,6,7,8,9,10] as const).map(n=> {
                          type AnioKey = `anio_${1|2|3|4|5|6|7|8|9|10}_percent`
                          const key = `anio_${n}_percent` as AnioKey
                          const val = (editProd as Partial<Record<AnioKey, number|null>>)[key]
                          return (
                            <div className="col-6 col-md-2" key={n}>
                              <label className="form-label small mb-1">AÑO {n}</label>
                              <div className="input-group input-group-sm">
                                <input name={key} type="number" step="0.01" min={0} max={100} value={val ?? ''} onChange={onChangeEditProd} className="form-control" />
                                <span className="input-group-text">%</span>
                              </div>
                            </div>
                          )
                        })}
                        <div className="col-6 col-md-2">
                          <label className="form-label small mb-1">AÑO 11+</label>
                          <div className="input-group input-group-sm">
                            <input name="anio_11_plus_percent" type="number" step="0.01" min={0} max={100} value={editProd.anio_11_plus_percent ?? ''} onChange={onChangeEditProd} className="form-control" />
                            <span className="input-group-text">%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </AppModal>
                )}
              </div>
            )}
          </section>
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
            <span className="fw-bold small text-uppercase">Metas</span>
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
              <label className="form-label small mb-1">Meta SMNYL / semana</label>
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
