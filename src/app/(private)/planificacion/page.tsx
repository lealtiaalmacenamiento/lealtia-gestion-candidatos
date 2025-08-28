'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import type { BloquePlanificacion, ProspectoEstado } from '@/types'
import { obtenerSemanaIso, formatearRangoSemana, semanaDesdeNumero } from '@/lib/semanaIso'
import { fetchFase2Metas } from '@/lib/fase2Params'

interface PlanificacionResponse { id?:number; agente_id:number; semana_iso:number; anio:number; bloques:BloquePlanificacion[]; prima_anual_promedio:number; porcentaje_comision:number }

const ACTIVIDADES = ['PROSPECCION','CITAS','SMNYL'] as const
const HORAS_BASE = Array.from({length:17},(_ ,i)=> (5+i).toString().padStart(2,'0')) // 05..21 rango base

export default function PlanificacionPage(){
  const { user } = useAuth()
  const superuser = user?.rol==='superusuario' || user?.rol==='admin'
  const semanaActual = useMemo(()=>obtenerSemanaIso(new Date()),[])
  const [anio,setAnio]=useState(semanaActual.anio)
  // Semana puede ser un número ISO o 'ALL' para vista anual
  const [semana,setSemana]=useState<number|"ALL">('ALL')
  const [agenteId,setAgenteId]=useState('')
  const [data,setData]=useState<PlanificacionResponse|null>(null)
  const [loading,setLoading]=useState(false)
  const agenteQuery = superuser && agenteId ? '&agente_id='+agenteId : ''
  const [metaCitas,setMetaCitas]=useState(5)

  const fetchData=async()=>{ 
    if(semana==='ALL'){ setData(null); return }
    setLoading(true)
    const planRes = await fetch(`/api/planificacion?semana=${semana}&anio=${anio}${agenteQuery}`)
    let plan: PlanificacionResponse | null = null
    if(planRes.ok) plan = await planRes.json()
    // Obtener citas y fusionar
    if(plan){
      const citasRes = await fetch(`/api/prospectos/citas?semana=${semana}&anio=${anio}${agenteQuery}`)
      if(citasRes.ok){
        const citas: Array<{id:number; fecha_cita:string; nombre:string; estado:string; notas?:string; telefono?:string}> = await citasRes.json()
        const rango = semanaDesdeNumero(anio, semana as number)
  const mondayLocal = new Date(rango.inicio.getUTCFullYear(), rango.inicio.getUTCMonth(), rango.inicio.getUTCDate())
        const manual = plan.bloques.filter(b=> b.origin !== 'auto')
        for(const c of citas){
          const dt = new Date(c.fecha_cita)
            // Calcular día basado en hora local del navegador
          const citaLocalMidnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
          const day = Math.floor((citaLocalMidnight.getTime() - mondayLocal.getTime())/86400000)
          if(day<0 || day>6) continue
          const hour = dt.getHours().toString().padStart(2,'0')
          if(!manual.find(b=> b.day===day && b.hour===hour)){
            manual.push({day, hour, activity:'CITAS', origin:'auto', prospecto_id:c.id, prospecto_nombre:c.nombre, prospecto_estado:c.estado as ProspectoEstado})
          } else {
            // Actualizar metadata si existe bloque CITAS manual en mismo slot
            manual.forEach(b=> { if(b.day===day && b.hour===hour && b.activity==='CITAS') Object.assign(b,{prospecto_id:c.id, prospecto_nombre:c.nombre, prospecto_estado:c.estado as ProspectoEstado}) })
          }
        }
        plan = {...plan, bloques: manual}
      }
      setData(plan)
    }
    setLoading(false)
  }
  useEffect(()=>{fetchData() // eslint-disable-next-line react-hooks/exhaustive-deps
  },[agenteId, semana, anio])

  // Escuchar eventos de actualización de citas desde la vista de prospectos
  useEffect(()=>{
    const handler=()=>{ fetchData() }
    window.addEventListener('prospectos:cita-updated', handler)
    return ()=> window.removeEventListener('prospectos:cita-updated', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[semana, anio, agenteId])

  // Refresco periódico de citas cada 60s para mantener sincronía con cambios en prospectos
  useEffect(()=>{
    if(semana==='ALL') return
    const id = setInterval(()=> fetchData(), 60000)
    return ()=> clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[semana, anio, agenteId])

  useEffect(()=> { fetchFase2Metas().then(m=> setMetaCitas(m.metaCitas)) },[])

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
    // Guardar de inmediato y refetch para sincronizar con citas
    setTimeout(()=> fetchData(), 200)
  }

  const horasCitas = data?.bloques.filter(b=>b.activity==='CITAS').length || 0
  const horasPlan = useMemo(()=>{
    const set = new Set(HORAS_BASE)
    if(data) data.bloques.forEach(b=> set.add(b.hour))
    return Array.from(set).sort()
  },[data])
  const ganancia = horasCitas * ( (data?.prima_anual_promedio||0) * ((data?.porcentaje_comision||0)/100) )

  const guardar = async()=>{
    if(!data) return
    if(semana==='ALL') return
    const body={
      agente_id: superuser && agenteId? Number(agenteId): undefined,
      semana_iso: semana as number,
      anio: anio,
      bloques: data.bloques,
      prima_anual_promedio: data.prima_anual_promedio,
      porcentaje_comision: data.porcentaje_comision
    }
    const r=await fetch('/api/planificacion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    if(r.ok) fetchData()
  }

  return <div className="container py-4">
    <h2 className="fw-semibold mb-3">Planificación semanal</h2>
    <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
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
          {Array.from({length:53},(_,i)=>i+1).map(w=> { const r=semanaDesdeNumero(anio,w); const label = `${w} (${formatearRangoSemana(r)})`; return <option key={w} value={w}>{label}</option>})}
        </select>
      </div>
      {superuser && <div>
        <label className="form-label small mb-1">Agente ID</label>
        <input placeholder="Agente ID" value={agenteId} onChange={e=>setAgenteId(e.target.value)} className="form-control form-control-sm w-auto"/>
      </div>}
    </div>
  {semana==='ALL' && <div className="alert alert-info py-2 small">Vista anual: seleccione una semana para editar planificación detallada.</div>}
  {data && semana!=='ALL' && <div className="row">
      <div className="col-lg-9 mb-3">
        <div className="table-responsive border rounded shadow-sm">
          <table className="table table-sm mb-0 align-middle text-center" style={{minWidth:900}}>
            <thead className="table-light"><tr><th style={{width:70}}>Hora</th>{['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((d,i)=> { const base=semanaDesdeNumero(anio, semana as number).inicio; const date=new Date(base); date.setUTCDate(base.getUTCDate()+i); const dia=date.getUTCDate().toString().padStart(2,'0'); const mes=(date.getUTCMonth()+1).toString().padStart(2,'0'); return <th key={d}>{d}<div className="small text-muted">{dia}/{mes}</div></th>})}</tr></thead>
            <tbody>
              {horasPlan.map(h=> <tr key={h}> <th className="bg-light fw-normal">{h}:00</th>
                {Array.from({length:7},(_,day)=>{
                  const blk = data.bloques.find(b=>b.day===day && b.hour===h)
                  const color = blk? blk.activity==='CITAS'? (blk.origin==='auto'? 'bg-success bg-opacity-75 text-white':'bg-success text-white'): blk.activity==='PROSPECCION'? 'bg-primary text-white':'bg-info text-dark':''
                  const onCellClick=()=>{
                    if(blk && blk.activity==='CITAS' && blk.origin==='auto' && blk.prospecto_id){
                      const detalle = `Prospecto #${blk.prospecto_id}\nNombre: ${blk.prospecto_nombre||''}\nEstado: ${blk.prospecto_estado||''}`
                      alert(detalle)
                    } else {
                      toggle(day,h)
                    }
                  }
                  return <td key={day} style={{cursor:'pointer'}} onClick={onCellClick} className={color} title={blk && blk.origin==='auto'? (blk.prospecto_nombre? blk.prospecto_nombre:'Cita agendada (auto)'): undefined}>{blk? blk.activity[0]: ''}</td>
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
          <div className="mb-2 small">Meta CITAS semanal: {metaCitas}</div>
          <div className="progress mb-2" role="progressbar" aria-valuenow={horasCitas} aria-valuemin={0} aria-valuemax={metaCitas}>
            <div className={`progress-bar ${horasCitas>=metaCitas? 'bg-success':'bg-info'}`} style={{width: `${Math.min(100,(horasCitas/metaCitas)*100)}%`}}>{horasCitas}/{metaCitas}</div>
          </div>
          <div className="mb-3 fw-semibold">Ganancia estimada: ${ganancia.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={loading || (typeof semana==='string')}>Guardar</button>
        </div>
  <div className="mt-3 small text-muted">Click en celda: ciclo PROSPECCION → CITAS → SMNYL → vacío. Letra mostrada: inicial de actividad.</div>
  {data.bloques.some(b=>b.origin==='auto') && <div className="mt-2 small">Citas auto: {data.bloques.filter(b=>b.origin==='auto').map(b=> `${b.day}/${b.hour}`).join(', ')}</div>}
      </div>
    </div>}
    {loading && <div>Cargando...</div>}
  </div>
}