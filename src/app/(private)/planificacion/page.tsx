'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Notification from '@/components/ui/Notification'
import AppModal from '@/components/ui/AppModal'
import { useAuth } from '@/context/AuthProvider'
import type { BloquePlanificacion, ProspectoEstado } from '@/types'
import { obtenerSemanaIso, formatearRangoSemana, semanaDesdeNumero } from '@/lib/semanaIso'
import { fetchFase2Metas } from '@/lib/fase2Params'

interface PlanificacionResponse { id?:number; agente_id:number; semana_iso:number; anio:number; bloques:BloquePlanificacion[]; prima_anual_promedio:number; porcentaje_comision:number }

// Ciclo original ya no usado para toggle directo, mantenido por referencia futura
// const ACTIVIDADES = ['PROSPECCION','CITAS','SMNYL'] as const

const HORAS_BASE = Array.from({length:17},(_ ,i)=> (5+i).toString().padStart(2,'0')) // 05..21 rango base

export default function PlanificacionPage(){
  const { user } = useAuth()
  const superuser = user?.rol==='superusuario' || user?.rol==='admin'
  const semanaActual = useMemo(()=>obtenerSemanaIso(new Date()),[])
  const [anio,setAnio]=useState(semanaActual.anio)
  const [semana,setSemana]=useState<number|"ALL">(semanaActual.semana)
  const [agenteId,setAgenteId]=useState('')
  const [data,setData]=useState<PlanificacionResponse|null>(null)
  const [loading,setLoading]=useState(false)
  const [dirty,setDirty]=useState(false)
  const [toast,setToast]=useState<{msg:string; type:'success'|'error'}|null>(null)
  const [modal,setModal]=useState<null|{day:number; hour:string; blk?:BloquePlanificacion}>(null)
  const [prospectosDisponibles,setProspectosDisponibles]=useState<Array<{id:number; nombre:string; estado:ProspectoEstado; notas?:string; telefono?:string}>>([])
  const saveDebounce = useRef<number | null>(null)
  const agenteQuery = superuser && agenteId ? `&agente_id=${agenteId}` : ''
  const [metaCitas,setMetaCitas]=useState(5)

  const fetchData = async () => {
    if(semana==='ALL'){ setData(null); return }
    setLoading(true)
    let plan: PlanificacionResponse | null = null
    const planRes = await fetch(`/api/planificacion?semana=${semana}&anio=${anio}${agenteQuery}`)
    if(planRes.ok) plan = await planRes.json()
    if(plan){
      // Citas de la semana seleccionada
      let citas: Array<{id:number; fecha_cita:string; nombre:string; estado:string; notas?:string; telefono?:string}> = []
      const citasRes = await fetch(`/api/prospectos/citas?semana=${semana}&anio=${anio}${agenteQuery}`)
      if(citasRes.ok) citas = await citasRes.json()

      // Prospectos pendientes/seguimiento sin cita
      let sinCita: Array<{id:number; nombre:string; estado:ProspectoEstado; notas?:string; telefono?:string}> = []
      const sinCitaRes = await fetch(`/api/prospectos?solo_sin_cita=1${agenteQuery}`)
      if(sinCitaRes.ok){
        const raw = await sinCitaRes.json()
  sinCita = raw.map((p: {id:number; nombre:string; estado:ProspectoEstado; notas?:string; telefono?:string})=> ({id:p.id, nombre:p.nombre, estado:p.estado as ProspectoEstado, notas:p.notas, telefono:p.telefono}))
      }

  // Solo prospectos sin cita (pendiente/seguimiento) para agendar
  setProspectosDisponibles(sinCita)

      // Integrar citas a bloques auto
      const rango = semanaDesdeNumero(anio, semana as number)
      const mondayLocal = new Date(rango.inicio.getUTCFullYear(), rango.inicio.getUTCMonth(), rango.inicio.getUTCDate())
      const manual = plan.bloques.filter(b=> b.origin !== 'auto')
      for(const c of citas){
        const dt = new Date(c.fecha_cita)
        const citaLocalMidnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
        const day = Math.floor((citaLocalMidnight.getTime() - mondayLocal.getTime())/86400000)
        if(day<0 || day>6) continue
        const hour = dt.getHours().toString().padStart(2,'0')
        const existente = manual.find(b=> b.day===day && b.hour===hour)
        if(!existente){
          manual.push({day, hour, activity:'CITAS', origin:'auto', prospecto_id:c.id, prospecto_nombre:c.nombre, prospecto_estado:c.estado as ProspectoEstado})
        } else if(existente.activity==='CITAS'){
          Object.assign(existente,{prospecto_id:c.id, prospecto_nombre:c.nombre, prospecto_estado:c.estado as ProspectoEstado})
        }
      }
      plan = {...plan, bloques: manual}
    }
    setData(plan)
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

  const openModal=(day:number,hour:string, blk?:BloquePlanificacion)=>{ 
    // Si abrimos un bloque de CITAS existente con prospecto ya con cita, aseguramos que aparezca en el select
    if(blk?.activity==='CITAS' && blk.prospecto_id){
      setProspectosDisponibles(prev=> prev.find(p=>p.id===blk.prospecto_id)? prev : [...prev, {id:blk.prospecto_id!, nombre:blk.prospecto_nombre||`#${blk.prospecto_id}`, estado: (blk.prospecto_estado||'con_cita') as ProspectoEstado}])
    }
    setModal({day,hour,blk}) 
  }
  const closeModal=()=> setModal(null)

  const upsertBloque=(b:BloquePlanificacion|null)=>{
    if(!data) return
  const nuevos = data.bloques.filter(x=> !(x.day===modal?.day && x.hour===modal?.hour))
    if(b) nuevos.push(b)
    setData({...data,bloques:nuevos})
    setDirty(true)
    // autosave debounce
    window.clearTimeout(saveDebounce.current)
    saveDebounce.current = window.setTimeout(()=>{ guardar(true) }, 1200) as unknown as number
  }

  const horasCitas = data?.bloques.filter(b=>b.activity==='CITAS').length || 0
  const horasPlan = useMemo(()=>{
    const set = new Set(HORAS_BASE)
    if(data) data.bloques.forEach(b=> set.add(b.hour))
    return Array.from(set).sort()
  },[data])
  const ganancia = horasCitas * ( (data?.prima_anual_promedio||0) * ((data?.porcentaje_comision||0)/100) )

  const guardar = async(auto=false)=>{
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
    if(r.ok){ fetchData(); setDirty(false); if(!auto) setToast({msg:'Planificación guardada', type:'success'}) } else { if(!auto) setToast({msg:'Error al guardar', type:'error'}) }
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
                  const label = blk? (blk.activity==='CITAS'? (blk.prospecto_nombre? `Cita ${blk.prospecto_nombre}`:'Cita'): blk.activity==='PROSPECCION'? 'Prospecto':'SMNYL') : ''
                  return <td key={day} style={{cursor:'pointer', fontSize:'0.7rem'}} onClick={()=>openModal(day,h,blk)} className={color} title={label}>{label}</td>
                })}
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="small text-muted mt-2 d-flex flex-wrap gap-3">
          <span><span className="badge bg-success">Cita</span> cita manual</span>
          <span><span className="badge bg-success bg-opacity-75 text-white">Cita auto</span> cita proveniente de prospecto</span>
          <span><span className="badge bg-primary">Prospección</span></span>
          <span><span className="badge bg-info text-dark">SMNYL</span></span>
          <span>Click celda = editar / crear bloque</span>
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
          <button className="btn btn-primary btn-sm" onClick={()=>guardar(false)} disabled={loading || (typeof semana==='string') || !dirty}>Guardar</button>
          <div className="form-text small">{dirty? 'Cambios pendientes de guardar.':'Sin cambios.'}</div>
        </div>
  {data.bloques.some(b=>b.origin==='auto') && <div className="mt-2 small">Citas auto: {data.bloques.filter(b=>b.origin==='auto').map(b=> { const base=semanaDesdeNumero(anio, semana as number).inicio; const date=new Date(base); date.setUTCDate(base.getUTCDate()+b.day); const dia=date.getUTCDate().toString().padStart(2,'0'); const mes=(date.getUTCMonth()+1).toString().padStart(2,'0'); const nombre=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][b.day]; return `${nombre} ${dia}/${mes} ${b.hour}:00`; }).join(', ')}</div>}
      </div>
    </div>}
  {loading && <div>Cargando...</div>}
  {toast && <Notification message={toast.msg} type={toast.type} onClose={()=>setToast(null)} />}
  {modal && data && <AppModal title={(()=>{ const base=semanaDesdeNumero(anio, semana as number).inicio; const date=new Date(base); date.setUTCDate(base.getUTCDate()+modal.day); const dia=date.getUTCDate().toString().padStart(2,'0'); const mes=(date.getUTCMonth()+1).toString().padStart(2,'0'); return `${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][modal.day]} ${dia}/${mes} ${modal.hour}:00` })()} icon="calendar-event" onClose={closeModal}>
    <BloqueEditor modal={modal} semanaBase={semanaDesdeNumero(anio, semana as number).inicio} prospectos={prospectosDisponibles} onSave={b=>{ upsertBloque(b); closeModal() }} onDelete={()=>{ upsertBloque(null); closeModal() }} />
  </AppModal>}
  </div>
}

function BloqueEditor({ modal, semanaBase, prospectos, onSave, onDelete }: { modal:{day:number; hour:string; blk?:BloquePlanificacion}; semanaBase: Date; prospectos:Array<{id:number; nombre:string; estado:ProspectoEstado; notas?:string; telefono?:string}>; onSave:(b:BloquePlanificacion|null)=>void; onDelete:()=>void }){
  const dias = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
  const [tipo,setTipo]=useState< 'PROSPECCION'|'CITAS'|'SMNYL' | ''>(modal.blk? modal.blk.activity: '')
  const [prospectoId,setProspectoId]=useState<number | ''>(modal.blk?.prospecto_id || '')
  const [notas,setNotas]=useState(modal.blk?.notas || '')
  const isCita = tipo==='CITAS'
  const guardar=()=>{
    if(!tipo){ onSave(null); return }
  if(!isCita && !notas.trim()) return alert('Notas obligatorias para este tipo')
  if(isCita && !prospectoId && !notas.trim()) return alert('Notas obligatorias si la cita no está vinculada a un prospecto')
    const base: BloquePlanificacion = {day:modal.day, hour:modal.hour, activity:tipo, origin:'manual'}
    if(isCita){
      if(prospectoId){
        const p = prospectos.find(p=> p.id===prospectoId)
        if(p) Object.assign(base,{prospecto_id:p.id, prospecto_nombre:p.nombre, prospecto_estado:p.estado})
      } else {
        base.notas = notas.trim()
      }
    } else {
      base.notas = notas.trim()
    }
    onSave(base)
  }
  // Datos detallados del prospecto de la cita auto si aplica
  const [detalle,setDetalle]=useState<{id:number; nombre:string; estado:ProspectoEstado; notas?:string; telefono?:string}|null>(null)
  useEffect(()=>{
    if(modal.blk?.activity==='CITAS' && modal.blk.prospecto_id){
      const local = prospectos.find(p=> p.id===modal.blk!.prospecto_id)
      if(local){ setDetalle(local) }
      // fetch explícito para asegurar teléfono y notas
      fetch(`/api/prospectos?id=${modal.blk.prospecto_id}`).then(r=> r.ok? r.json():null).then(d=>{
        if(Array.isArray(d) && d[0]){
          const p=d[0]
          setDetalle({id:p.id, nombre:p.nombre, estado:p.estado, notas:p.notas||undefined, telefono:p.telefono||undefined})
        }
      }).catch(()=>{})
    } else {
      setDetalle(null)
    }
  },[modal.blk, prospectos])
  const fechaBloque = new Date(semanaBase); fechaBloque.setUTCDate(fechaBloque.getUTCDate()+modal.day)
  const diaNum = fechaBloque.getUTCDate().toString().padStart(2,'0')
  const mesNum = (fechaBloque.getUTCMonth()+1).toString().padStart(2,'0')
  return <div className="small">
    <div className="mb-2 fw-semibold">{dias[modal.day]} {diaNum}/{mesNum} {modal.hour}:00</div>
    <div className="mb-2">
      <label className="form-label small mb-1">Tipo</label>
  <select className="form-select form-select-sm" value={tipo} onChange={e=>{ setTipo(e.target.value as 'PROSPECCION'|'CITAS'|'SMNYL'|''); if(e.target.value!=='CITAS') setProspectoId('') }}>
        <option value="">(Vacío)</option>
        <option value="PROSPECCION">Prospecto</option>
        <option value="CITAS">Cita</option>
        <option value="SMNYL">SMNYL</option>
      </select>
    </div>
    {isCita && <div className="mb-2">
      <label className="form-label small mb-1">Prospecto (opcional)</label>
      <select className="form-select form-select-sm" value={prospectoId} onChange={e=> setProspectoId(e.target.value? Number(e.target.value): '')}>
        <option value="">(Sin vincular)</option>
        {prospectos.map(p=> <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
    </div>}
    {((!isCita && tipo) || (isCita && !prospectoId)) && <div className="mb-2">
      <label className="form-label small mb-1">Notas (obligatorias{isCita && !prospectoId? ' si no hay prospecto':''})</label>
      <textarea rows={3} className="form-control form-control-sm" value={notas} onChange={e=> setNotas(e.target.value)} />
    </div>}
    {modal.blk && modal.blk.activity==='CITAS' && modal.blk.prospecto_nombre && detalle && <div className="alert alert-info p-2 small">
      <div className="fw-semibold mb-1">Prospecto</div>
      <div className="mb-1"><strong>Nombre:</strong> {detalle.nombre}</div>
      <div className="mb-1"><strong>Teléfono:</strong> {detalle.telefono || '—'}</div>
      <div className="mb-1"><strong>Estado:</strong> {detalle.estado}</div>
      <div className="mb-0"><strong>Notas:</strong> {detalle.notas || '—'}</div>
    </div>}
    <div className="d-flex gap-2 mt-3">
      <button className="btn btn-primary btn-sm" onClick={guardar}>Guardar</button>
      <button className="btn btn-outline-secondary btn-sm" onClick={()=> onSave(null)}>Vaciar</button>
      <button className="btn btn-outline-danger btn-sm ms-auto" onClick={onDelete}>Eliminar</button>
    </div>
  </div>
}