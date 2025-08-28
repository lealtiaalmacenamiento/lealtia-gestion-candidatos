'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Notification from '@/components/ui/Notification'
import { useAuth } from '@/context/AuthProvider'
import type { Prospecto, ProspectoEstado } from '@/types'
import { ESTADO_CLASSES, ESTADO_LABEL, estadoOptions } from '@/lib/prospectosUI'
import { exportProspectosPDF } from '@/lib/prospectosExport'
import { fetchFase2Metas } from '@/lib/fase2Params'
import { obtenerSemanaIso, formatearRangoSemana, semanaDesdeNumero } from '@/lib/semanaIso'

interface Aggregate { total:number; por_estado: Record<string,number>; cumplimiento_30:boolean }

export default function ProspectosPage() {
  const { user } = useAuth()
  const semanaActual = useMemo(()=>obtenerSemanaIso(new Date()),[])
  const [anio,setAnio]=useState(semanaActual.anio)
  // Semana puede ser número ISO o 'ALL' para todo el año
  const [semana,setSemana]=useState<number|"ALL">(semanaActual.semana)
  const [prospectos,setProspectos]=useState<Prospecto[]>([])
  const [loading,setLoading]=useState(false)
  const [agg,setAgg]=useState<Aggregate|null>(null)
  const [estadoFiltro,setEstadoFiltro]=useState<ProspectoEstado|''>('')
  const [form,setForm]=useState({ nombre:'', telefono:'', notas:'', estado:'pendiente' as ProspectoEstado, fecha_cita:'', fecha_cita_fecha:'', fecha_cita_hora:'' })
  const [errorMsg,setErrorMsg]=useState<string>('')
  const [toast,setToast]=useState<{msg:string; type:'success'|'error'}|null>(null)
  const [horasOcupadas,setHorasOcupadas]=useState<Record<string,string[]>>({}) // fecha -> ['08','09']
  const [citaDrafts,setCitaDrafts]=useState<Record<number,{fecha?:string; hora?:string}>>({})

  const precargarHoras = async(fecha:string)=>{
    // Reutiliza lista actual filtrando por la fecha para evitar llamada pesada
    // Si ya tenemos la fecha en cache, no refetch
    if(horasOcupadas[fecha]) return
    // Usamos fetchAll ya cargado (prospectos), si no contiene la fecha, hacemos fetch parcial
    const existing = prospectos.filter(p=> p.fecha_cita && p.fecha_cita.startsWith(fecha))
    let list = existing
    if(list.length===0){
      // Obtener año y semana de esa fecha para traer potenciales citas de ese intervalo
      const d = new Date(fecha+ 'T00:00:00')
      const { anio: a, semana: w } = obtenerSemanaIso(d)
      const params = new URLSearchParams({ anio:String(a), semana:String(w), solo_con_cita:'1' })
      const r = await fetch('/api/prospectos?'+params.toString())
      if(r.ok){ const arr: Prospecto[] = await r.json(); list = arr.filter(p=> p.fecha_cita && p.fecha_cita.startsWith(fecha)) }
    }
    const horas = Array.from(new Set(list.map(p=> { const dt=new Date(p.fecha_cita!); return String(dt.getHours()).padStart(2,'0') })))
    setHorasOcupadas(prev=> ({...prev,[fecha]:horas}))
  }
  const [agenteId,setAgenteId]=useState<string>('')
  const [agentes,setAgentes]=useState<Array<{id:number; nombre?:string; email:string}>>([])
  const debounceRef = useRef<number|null>(null)
  const [metaProspectos,setMetaProspectos]=useState(30)
  const [soloConCita,setSoloConCita]=useState(false)
  const superuser = user?.rol==='superusuario' || user?.rol==='admin'

  const applyEstadoFiltro = (estado: ProspectoEstado | '') => {
    setEstadoFiltro(prev => prev === estado ? '' : estado)
  }

  const fetchAgentes = async()=>{
    if(!superuser) return
    const r = await fetch('/api/agentes')
    if(r.ok) {
      const list = await r.json()
      setAgentes(list)
    }
  }

  const fetchAll=async()=>{
    setLoading(true)
  const params = new URLSearchParams({ anio:String(anio) })
    if (semana !== 'ALL') params.set('semana', String(semana))
    if (estadoFiltro) params.set('estado', estadoFiltro)
    if (superuser && agenteId) params.set('agente_id', agenteId)
  if (soloConCita) params.set('solo_con_cita','1')
    const r = await fetch('/api/prospectos?'+params.toString())
    if (r.ok) setProspectos(await r.json())
    const r2 = await fetch('/api/prospectos/aggregate?'+params.toString())
    if (r2.ok) setAgg(await r2.json())
    setLoading(false)
  }

  useEffect(()=>{ fetchAll(); if(superuser) fetchAgentes() // eslint-disable-next-line react-hooks/exhaustive-deps
  },[estadoFiltro, agenteId, semana, anio, soloConCita])

  useEffect(()=> { fetchFase2Metas().then(m=> setMetaProspectos(m.metaProspectos)) },[])

  const submit=async(e:React.FormEvent)=>{e.preventDefault(); setErrorMsg(''); if(!form.nombre.trim()) return; const body: Record<string,unknown>={ nombre:form.nombre, telefono:form.telefono, notas:form.notas, estado:form.estado };
    if(form.fecha_cita_fecha && form.fecha_cita_hora){
      const combo = `${form.fecha_cita_fecha}T${form.fecha_cita_hora}:00`
      body.fecha_cita = new Date(combo).toISOString()
    }
    const r=await fetch('/api/prospectos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.ok){ setForm({nombre:'',telefono:'',notas:'',estado:'pendiente',fecha_cita:'',fecha_cita_fecha:'',fecha_cita_hora:''}); fetchAll(); setToast({msg:'Prospecto creado', type:'success'}) }
    else { try { const j=await r.json(); setErrorMsg(j.error||'Error'); setToast({msg:j.error||'Error', type:'error'}) } catch { setErrorMsg('Error al guardar'); setToast({msg:'Error al guardar', type:'error'}) } }
  }

  const update=(id:number, patch:Partial<Prospecto>)=> {
    // debounce mínimo
    window.clearTimeout(debounceRef.current||0)
    debounceRef.current = window.setTimeout(()=>{
      const toSend:Record<string,unknown>={...patch}
      if(patch.fecha_cita){
        const fc=String(patch.fecha_cita)
        if(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(fc)) toSend.fecha_cita=new Date(fc).toISOString()
      }
  fetch('/api/prospectos/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(toSend)}).then(async r=>{ if(r.ok){ fetchAll(); window.dispatchEvent(new CustomEvent('prospectos:cita-updated')); setToast({msg:'Actualizado', type:'success'}) } else { try { const j=await r.json(); setToast({msg:j.error||'Error', type:'error'}) } catch { setToast({msg:'Error', type:'error'}) } } })
    },300)
  }

  const eliminar=(id:number)=>{ if(!confirm('Eliminar prospecto?')) return; fetch('/api/prospectos/'+id,{method:'DELETE'}).then(r=>{ if(r.ok) fetchAll() }) }

  return <div className="container py-4">
    <h2 className="fw-semibold mb-3">Prospectos</h2>
    <div className="d-flex flex-wrap gap-3 align-items-end mb-2">
      <div>
        <label className="form-label small mb-1">Año</label>
        <select className="form-select form-select-sm" value={anio} onChange={e=>setAnio(Number(e.target.value))}>
          {Array.from({length:3},(_,i)=>semanaActual.anio-1+i).map(y=> <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div style={{minWidth:230}}>
        <label className="form-label small mb-1">Semana</label>
        <select className="form-select form-select-sm" style={{minWidth:230}} value={semana} onChange={e=>{ const v=e.target.value; setSemana(v==='ALL'?'ALL':Number(v)) }} title={semana!=='ALL'? (()=>{ const r=semanaDesdeNumero(anio, semana as number); return `Semana ${semana} ${formatearRangoSemana(r)}`})(): 'Todo el año'}>
          <option value="ALL">Todo el año</option>
          {Array.from({length:53},(_,i)=> i+1).map(w=> { const r = semanaDesdeNumero(anio, w); const range = formatearRangoSemana(r); return <option key={w} value={w}>{w} ({range})</option> })}
        </select>
      </div>
    </div>
    {superuser && <div className="mb-3 d-flex gap-2 align-items-center">
      <select value={agenteId} onChange={e=>setAgenteId(e.target.value)} className="form-select w-auto">
        <option value="">(Seleccionar agente)</option>
        {agentes.map(a=> <option key={a.id} value={a.id}>{a.nombre || a.email}</option>)}
      </select>
  {agenteId && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=>exportProspectosPDF(prospectos, agg || {total:0,por_estado:{},cumplimiento_30:false}, `Prospectos ${semana==='ALL'?'Año': 'Semana '+semana}`)}>PDF</button>}
    </div>}
  <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
      <div className="form-check form-switch small">
        <input className="form-check-input" type="checkbox" id="soloCitaChk" checked={soloConCita} onChange={e=>setSoloConCita(e.target.checked)} />
        <label className="form-check-label" htmlFor="soloCitaChk">Solo con cita</label>
      </div>
      {agg && (!superuser || (superuser && agenteId)) && <div className="d-flex flex-column gap-2 small">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <button type="button" onClick={()=>applyEstadoFiltro('')} className={`badge border-0 ${estadoFiltro===''? 'bg-primary':'bg-secondary'} text-white`} title="Todos">Total {agg.total}</button>
          {Object.entries(agg.por_estado).map(([k,v])=> { const active = estadoFiltro===k; return <button type="button" key={k} onClick={()=>applyEstadoFiltro(k as ProspectoEstado)} className={`badge border ${active? 'bg-primary text-white':'bg-light text-dark'}`} style={{cursor:'pointer'}}>{ESTADO_LABEL[k as ProspectoEstado]} {v}</button>})}
          <span className={"badge "+ (agg.total>=metaProspectos? 'bg-success':'bg-warning text-dark')} title="Progreso a meta">{agg.total>=metaProspectos? `Meta ${metaProspectos} ok`:`<${metaProspectos} prospectos`}</span>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=> exportProspectosPDF(prospectos, agg, `Prospectos ${semana==='ALL'?'Año': 'Semana '+semana}`)}>PDF</button>
        </div>
        {(!superuser || (superuser && agenteId)) && <div style={{minWidth:260}} className="progress" role="progressbar" aria-valuenow={agg.total} aria-valuemin={0} aria-valuemax={metaProspectos}>
          <div className={`progress-bar ${agg.total>=metaProspectos? 'bg-success':'bg-warning text-dark'}`} style={{width: `${Math.min(100, (agg.total/metaProspectos)*100)}%`}}>{agg.total}/{metaProspectos}</div>
        </div>}
      </div>}
    </div>
  <form onSubmit={submit} className="card p-3 mb-4 shadow-sm">
      <div className="row g-2">
        <div className="col-sm-3"><input required value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre" className="form-control"/></div>
        <div className="col-sm-2"><input value={form.telefono} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} placeholder="Teléfono" className="form-control"/></div>
        <div className="col-sm-3"><input value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Notas" className="form-control"/></div>
        <div className="col-sm-2"><select value={form.estado} onChange={e=>setForm(f=>({...f,estado:e.target.value as ProspectoEstado}))} className="form-select">{estadoOptions().map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
  <div className="col-sm-1"><input type="date" value={form.fecha_cita_fecha} onChange={e=>{ const fecha=e.target.value; setForm(f=>({...f,fecha_cita_fecha:fecha})); if(fecha) precargarHoras(fecha) }} className="form-control"/></div>
  <div className="col-sm-1"><select className="form-select" value={form.fecha_cita_hora} onChange={e=>setForm(f=>({...f,fecha_cita_hora:e.target.value}))}><option value="">(Hora)</option>{Array.from({length:24},(_,i)=> i).map(h=> { const hh=String(h).padStart(2,'0'); const ocup = form.fecha_cita_fecha && horasOcupadas[form.fecha_cita_fecha]?.includes(hh); return <option key={h} value={hh} disabled={ocup}>{hh}:00{ocup?' (X)':''}</option>})}</select></div>
      </div>
      <div className="mt-2"><button className="btn btn-primary btn-sm" disabled={loading}>Agregar</button></div>
      {errorMsg && <div className="text-danger small mt-2">{errorMsg}</div>}
    </form>
    <div className="table-responsive">
      <table className="table table-sm align-middle">
  <thead><tr><th>ID</th><th>Nombre</th><th>Teléfono</th><th>Notas</th><th>Estado</th><th>Cita</th><th></th></tr></thead>
        <tbody>
          {prospectos.map(p=> <tr key={p.id}>
            <td>{p.id}</td>
            <td><span className={'d-inline-block px-2 py-1 rounded '+ESTADO_CLASSES[p.estado]}>{p.nombre}</span></td>
            <td>{p.telefono||''}</td>
            <td style={{maxWidth:180}}><input value={p.notas||''} onChange={e=>update(p.id,{notas:e.target.value})} className="form-control form-control-sm"/></td>
            <td>
              <select value={p.estado} onChange={e=>update(p.id,{estado:e.target.value as ProspectoEstado})} className="form-select form-select-sm">
                {estadoOptions().map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </td>
            <td style={{minWidth:170}}>
              {(()=>{ const dIso=p.fecha_cita? new Date(p.fecha_cita): null; const pad=(n:number)=>String(n).padStart(2,'0');
                const draft = citaDrafts[p.id] || {}
                const dateVal = dIso? `${dIso.getFullYear()}-${pad(dIso.getMonth()+1)}-${pad(dIso.getDate())}`: (draft.fecha||'')
                const hourVal = dIso? pad(dIso.getHours()): (draft.hora||'')
                const setDraft=(partial: {fecha?:string; hora?:string})=> setCitaDrafts(prev=> ({...prev, [p.id]: {...prev[p.id], ...partial}}))
                return <div className="d-flex gap-1 flex-column">
                  <div className="d-flex gap-1">
                    <input type="date" value={dateVal} onChange={e=>{ const newDate=e.target.value; if(!newDate){ setDraft({fecha:undefined}); update(p.id,{fecha_cita:null, estado: p.estado==='con_cita'? 'pendiente': p.estado}); return }
                      setDraft({fecha:newDate}); if(hourVal){ const patch: Partial<Prospecto & {estado?: ProspectoEstado}> = {fecha_cita:`${newDate}T${hourVal}:00`}; if(p.estado!=='con_cita') patch.estado='con_cita'; update(p.id,patch); setCitaDrafts(prev=> { const cp={...prev}; delete cp[p.id]; return cp }) } }} className="form-control form-control-sm"/>
                    <select className="form-select form-select-sm" value={hourVal} onChange={e=>{ const h=e.target.value; if(!h){ setDraft({hora:undefined}); update(p.id,{fecha_cita:null, estado: p.estado==='con_cita'? 'pendiente': p.estado}); return }
                      setDraft({hora:h}); if(dateVal){ const patch: Partial<Prospecto & {estado?: ProspectoEstado}>={fecha_cita:`${dateVal}T${h}:00`}; if(p.estado!=='con_cita') patch.estado='con_cita'; update(p.id,patch); setCitaDrafts(prev=> { const cp={...prev}; delete cp[p.id]; return cp }) } }}>
                      <option value="">--</option>
                      {Array.from({length:24},(_,i)=> i).map(h=> <option key={h} value={pad(h)}>{pad(h)}:00</option>)}
                    </select>
                  </div>
                  {p.fecha_cita && <div className="small text-muted">{new Date(p.fecha_cita).toLocaleString('es-MX',{weekday:'long', hour:'2-digit'})}</div>}
                </div> })()}
            </td>
            <td><button onClick={()=>eliminar(p.id)} className="btn btn-outline-danger btn-sm">×</button></td>
          </tr>)}
          {(!loading && prospectos.length===0) && <tr><td colSpan={7} className="text-center py-4 text-muted">No hay prospectos para los filtros actuales.</td></tr>}
        </tbody>
      </table>
      {loading && <div className="p-3">Cargando...</div>}
    </div>
    {toast && <Notification message={toast.msg} type={toast.type} onClose={()=>setToast(null)} />}
  </div>
}
