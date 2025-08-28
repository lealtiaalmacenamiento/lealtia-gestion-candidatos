'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import type { BloquePlanificacion } from '@/types'
import { obtenerSemanaIso } from '@/lib/semanaIso'

interface PlanificacionResponse { id?:number; agente_id:number; semana_iso:number; anio:number; bloques:BloquePlanificacion[]; prima_anual_promedio:number; porcentaje_comision:number }

const ACTIVIDADES = ['PROSPECCION','CITAS','SMNYL'] as const
const HORAS = Array.from({length:17},(_ ,i)=> (5+i).toString().padStart(2,'0')) // 05..21

export default function PlanificacionPage(){
  const { user } = useAuth()
  const superuser = user?.rol==='superusuario' || user?.rol==='admin'
  const semanaActual = useMemo(()=>obtenerSemanaIso(new Date()),[])
  const [agenteId,setAgenteId]=useState('')
  const [data,setData]=useState<PlanificacionResponse|null>(null)
  const [loading,setLoading]=useState(false)
  const agenteQuery = superuser && agenteId ? '&agente_id='+agenteId : ''

  const fetchData=async()=>{ setLoading(true); const r=await fetch(`/api/planificacion?semana=${semanaActual.semana}&anio=${semanaActual.anio}${agenteQuery}`); if(r.ok) setData(await r.json()); setLoading(false) }
  useEffect(()=>{fetchData() // eslint-disable-next-line react-hooks/exhaustive-deps
  },[agenteId])

  const toggle=(day:number,hour:string)=>{
    if(!data) return
    const existing = data.bloques.find(b=>b.day===day && b.hour===hour)
    let nuevos:BloquePlanificacion[]
    if(!existing){ nuevos=[...data.bloques,{day,hour,activity:'PROSPECCION'}] }
    else {
      const idx = ACTIVIDADES.indexOf(existing.activity as typeof ACTIVIDADES[number])
      const next = ACTIVIDADES[(idx+1)%ACTIVIDADES.length]
      // Si volvió al primer ciclo, permitir vaciar
      if(idx===ACTIVIDADES.length-1){ nuevos = data.bloques.filter(b=> !(b.day===day && b.hour===hour)) }
      else { nuevos = data.bloques.map(b=> b===existing? {...b,activity:next}:b) }
    }
    setData({...data,bloques:nuevos})
  }

  const horasCitas = data?.bloques.filter(b=>b.activity==='CITAS').length || 0
  const ganancia = horasCitas * ( (data?.prima_anual_promedio||0) * ((data?.porcentaje_comision||0)/100) )

  const guardar = async()=>{
    if(!data) return
    const body={
      agente_id: superuser && agenteId? Number(agenteId): undefined,
      semana_iso: semanaActual.semana,
      anio: semanaActual.anio,
      bloques: data.bloques,
      prima_anual_promedio: data.prima_anual_promedio,
      porcentaje_comision: data.porcentaje_comision
    }
    const r=await fetch('/api/planificacion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    if(r.ok) fetchData()
  }

  return <div className="container py-4">
    <h2 className="fw-semibold mb-3">Planificación semanal – Semana {semanaActual.semana}</h2>
    {superuser && <div className="mb-3 d-flex gap-2"><input placeholder="Agente ID" value={agenteId} onChange={e=>setAgenteId(e.target.value)} className="form-control w-auto"/></div>}
    {data && <div className="row">
      <div className="col-lg-9 mb-3">
        <div className="table-responsive border rounded shadow-sm">
          <table className="table table-sm mb-0 align-middle text-center" style={{minWidth:900}}>
            <thead className="table-light"><tr><th style={{width:70}}>Hora</th>{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=> <th key={d}>{d}</th>)}</tr></thead>
            <tbody>
              {HORAS.map(h=> <tr key={h}> <th className="bg-light fw-normal">{h}:00</th>
                {Array.from({length:7},(_,day)=>{
                  const blk = data.bloques.find(b=>b.day===day && b.hour===h)
                  const color = blk? blk.activity==='CITAS'? 'bg-success text-white': blk.activity==='PROSPECCION'? 'bg-primary text-white':'bg-info text-dark':''
                  return <td key={day} style={{cursor:'pointer'}} onClick={()=>toggle(day,h)} className={color}>{blk? blk.activity[0]: ''}</td>
                })}
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
      <div className="col-lg-3">
        <div className="card p-3 shadow-sm">
          <div className="mb-2 small">Horas CITAS: <strong>{horasCitas}</strong></div>
          <div className="mb-2 small">Prima anual promedio <input type="number" className="form-control form-control-sm" value={data.prima_anual_promedio} onChange={e=>setData({...data,prima_anual_promedio:Number(e.target.value)})}/></div>
          <div className="mb-2 small">% Comisión <input type="number" className="form-control form-control-sm" value={data.porcentaje_comision} onChange={e=>setData({...data,porcentaje_comision:Number(e.target.value)})}/></div>
          <div className="mb-3 fw-semibold">Ganancia estimada: ${ganancia.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={loading}>Guardar</button>
        </div>
        <div className="mt-3 small text-muted">Click en celda: ciclo PROSPECCION → CITAS → SMNYL → vacío. Letra mostrada: inicial de actividad.</div>
      </div>
    </div>}
    {loading && <div>Cargando...</div>}
  </div>
}