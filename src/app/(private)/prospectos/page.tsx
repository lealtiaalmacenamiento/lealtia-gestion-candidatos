'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import type { Prospecto, ProspectoEstado } from '@/types'
import { ESTADO_CLASSES, ESTADO_LABEL, estadoOptions } from '@/lib/prospectosUI'
import { exportProspectosPDF } from '@/lib/prospectosExport'
import { obtenerSemanaIso } from '@/lib/semanaIso'

interface Aggregate { total:number; por_estado: Record<string,number>; cumplimiento_30:boolean }

export default function ProspectosPage() {
  const { user } = useAuth()
  const semanaActual = useMemo(()=>obtenerSemanaIso(new Date()),[])
  const [prospectos,setProspectos]=useState<Prospecto[]>([])
  const [loading,setLoading]=useState(false)
  const [agg,setAgg]=useState<Aggregate|null>(null)
  const [estadoFiltro,setEstadoFiltro]=useState<ProspectoEstado|''>('')
  const [form,setForm]=useState({ nombre:'', telefono:'', notas:'', estado:'pendiente' as ProspectoEstado, fecha_cita:'' })
  const [agenteId,setAgenteId]=useState<string>('')
  const [agentes,setAgentes]=useState<Array<{id:number; nombre?:string; email:string}>>([])
  const debounceRef = useRef<number|null>(null)
  const superuser = user?.rol==='superusuario' || user?.rol==='admin'

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
    const params = new URLSearchParams({ semana:String(semanaActual.semana), anio:String(semanaActual.anio) })
    if (estadoFiltro) params.set('estado', estadoFiltro)
    if (superuser && agenteId) params.set('agente_id', agenteId)
    const r = await fetch('/api/prospectos?'+params.toString())
    if (r.ok) setProspectos(await r.json())
    const r2 = await fetch('/api/prospectos/aggregate?'+params.toString())
    if (r2.ok) setAgg(await r2.json())
    setLoading(false)
  }

  useEffect(()=>{ fetchAll(); if(superuser) fetchAgentes() // eslint-disable-next-line react-hooks/exhaustive-deps
  },[estadoFiltro, agenteId])

  const submit=async(e:React.FormEvent)=>{e.preventDefault(); if(!form.nombre.trim()) return; const body: Record<string,unknown>={...form}; if(!body.fecha_cita) delete body.fecha_cita; const r=await fetch('/api/prospectos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(r.ok){setForm({nombre:'',telefono:'',notas:'',estado:'pendiente',fecha_cita:''}); fetchAll()} }

  const update=(id:number, patch:Partial<Prospecto>)=> {
    // debounce mínimo
    window.clearTimeout(debounceRef.current||0)
    debounceRef.current = window.setTimeout(()=>{
      fetch('/api/prospectos/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)}).then(r=>{ if(r.ok) fetchAll() })
    },300)
  }

  const eliminar=(id:number)=>{ if(!confirm('Eliminar prospecto?')) return; fetch('/api/prospectos/'+id,{method:'DELETE'}).then(r=>{ if(r.ok) fetchAll() }) }

  return <div className="container py-4">
    <h2 className="fw-semibold mb-3">Prospectos – Semana {semanaActual.semana} ({semanaActual.anio})</h2>
    {superuser && <div className="mb-3 d-flex gap-2 align-items-center">
      <select value={agenteId} onChange={e=>setAgenteId(e.target.value)} className="form-select w-auto">
        <option value="">(Seleccionar agente)</option>
        {agentes.map(a=> <option key={a.id} value={a.id}>{a.nombre || a.email}</option>)}
      </select>
      {agenteId && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=>exportProspectosPDF(prospectos, agg || {total:0,por_estado:{},cumplimiento_30:false}, `Prospectos Semana ${semanaActual.semana}`)}>PDF</button>}
    </div>}
  <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
      <select value={estadoFiltro} onChange={e=>setEstadoFiltro(e.target.value as ProspectoEstado|'' )} className="form-select w-auto">
        <option value="">Todos los estados</option>
        {estadoOptions().map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {agg && <div className="d-flex flex-column gap-2 small">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <span className="badge bg-secondary">Total {agg.total}</span>
          {Object.entries(agg.por_estado).map(([k,v])=> <span key={k} className="badge bg-light text-dark border">{ESTADO_LABEL[k as ProspectoEstado]} {v}</span>)}
          <span className={"badge "+ (agg.cumplimiento_30? 'bg-success':'bg-warning text-dark')}>{agg.cumplimiento_30? 'Meta 30 ok':'<30 prospectos'}</span>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=> exportProspectosPDF(prospectos, agg, `Prospectos Semana ${semanaActual.semana}`)}>PDF</button>
        </div>
        <div style={{minWidth:260}} className="progress" role="progressbar" aria-valuenow={agg.total} aria-valuemin={0} aria-valuemax={30}>
          <div className={`progress-bar ${agg.total>=30? 'bg-success':'bg-warning text-dark'}`} style={{width: `${Math.min(100, (agg.total/30)*100)}%`}}>{agg.total}/30</div>
        </div>
      </div>}
    </div>
    <form onSubmit={submit} className="card p-3 mb-4 shadow-sm">
      <div className="row g-2">
        <div className="col-sm-3"><input required value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre" className="form-control"/></div>
        <div className="col-sm-2"><input value={form.telefono} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} placeholder="Teléfono" className="form-control"/></div>
        <div className="col-sm-3"><input value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Notas" className="form-control"/></div>
        <div className="col-sm-2"><select value={form.estado} onChange={e=>setForm(f=>({...f,estado:e.target.value as ProspectoEstado}))} className="form-select">{estadoOptions().map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div className="col-sm-2"><input type="date" value={form.fecha_cita} onChange={e=>setForm(f=>({...f,fecha_cita:e.target.value}))} className="form-control"/></div>
      </div>
      <div className="mt-2"><button className="btn btn-primary btn-sm" disabled={loading}>Agregar</button></div>
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
            <td><input type="date" value={p.fecha_cita||''} onChange={e=>update(p.id,{fecha_cita:e.target.value||null})} className="form-control form-control-sm"/></td>
            <td><button onClick={()=>eliminar(p.id)} className="btn btn-outline-danger btn-sm">×</button></td>
          </tr>)}
        </tbody>
      </table>
      {loading && <div className="p-3">Cargando...</div>}
    </div>
  </div>
}
