'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Notification from '@/components/ui/Notification'
import AppModal from '@/components/ui/AppModal'
import { useAuth } from '@/context/AuthProvider'
import type { BloquePlanificacion } from '@/types'
import { obtenerSemanaIso, formatearRangoSemana, semanaDesdeNumero } from '@/lib/semanaIso'
import { fetchFase2Metas } from '@/lib/fase2Params'
import { useDialog } from '@/components/ui/DialogProvider'

interface PlanificacionResponse { id?:number; agente_id:number; semana_iso:number; anio:number; bloques:BloquePlanificacion[]; prima_anual_promedio:number; porcentaje_comision:number }

// Ciclo original ya no usado para toggle directo, mantenido por referencia futura
// const ACTIVIDADES = ['PROSPECCION','CITAS','SMNYL'] as const

// Mostrar calendario con 24 horas (00..23)
const HORAS_BASE = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))

export default function PlanificacionPage(){
  const { user } = useAuth()
  const dialog = useDialog()
  const superuser = user?.rol==='superusuario' || user?.rol==='admin'
  const semanaActual = useMemo(()=>obtenerSemanaIso(new Date()),[])
  const [anio,setAnio]=useState(semanaActual.anio)
  const [semana,setSemana]=useState<number|"ALL">(semanaActual.semana)
  const [agenteId,setAgenteId]=useState('')
  const [agentes,setAgentes]=useState<Array<{id:number; nombre?:string; email:string}>>([])
  const [data,setData]=useState<PlanificacionResponse|null>(null)
  const [loading,setLoading]=useState(false)
  const [dirty,setDirty]=useState(false)
  const [toast,setToast]=useState<{msg:string; type:'success'|'error'}|null>(null)
  const [modal,setModal]=useState<null|{day:number; hour:string; blk?:BloquePlanificacion}>(null)
  // Autosave eliminado
  const lastSavedManualRef = useRef<string>('') // para evitar refetch innecesario post-guardado
  const localManualRef = useRef<BloquePlanificacion[]>([])
  const agenteQuery = superuser && agenteId ? `&agente_id=${agenteId}` : ''
  // Siempre se "congela" todo: manuales y auto; se elimina el switch.

  const fetchData = async (force=false, trigger: 'manual'|'interval'|'postsave'='manual') => {
    if(semana==='ALL'){ setData(null); return }
    // Si hay cambios locales sin guardar y no es un fetch forzado, evitamos sobreescribir (causa "desaparecer" bloques)
    if(dirty && !force) return
  const showLoading = trigger!=='interval'
  if(showLoading) setLoading(true)
  let plan: PlanificacionResponse | null = null
  const planRes = await fetch(`/api/planificacion?semana=${semana}&anio=${anio}${agenteQuery}`, { cache: 'no-store' })
    if(planRes.ok) plan = await planRes.json()
    if(planRes.ok){
      try { console.debug('PLANIF_FETCH_RAW', await planRes.clone().text()) } catch {}
    }
    if(plan){
      // Normalizar horas a 'HH'
      const normalizados = (plan.bloques||[]).map(b=> ({
        ...b,
        hour: typeof b.hour === 'string'? b.hour.padStart(2,'0'): String(b.hour).padStart(2,'0'),
        origin: b.origin ? b.origin : 'manual'
      }))
      // Si había cambios locales pendientes y este es un fetch forzado (post-guardado), mergeamos bloques manuales que aún no estén en remoto
      // Solo mergear manuales locales tras un guardado exitoso; evitar mezclar al cambiar de semana/agente
      let bloquesConsolidados = normalizados
      if(force && trigger==='postsave' && data && data.bloques && data.bloques.length){
        const remoteKeys = new Set(normalizados.map(b=> `${b.day}-${b.hour}-${b.activity}`))
        for(const b of data.bloques){
          if(b.origin !== 'auto'){
            const k = `${b.day}-${b.hour}-${b.activity}`
            if(!remoteKeys.has(k)) bloquesConsolidados.push({ ...b, origin: b.origin ?? 'manual' })
          }
        }
      }
      // Ordenamos por día/hora para representación consistente
      bloquesConsolidados = bloquesConsolidados.sort((a,b)=> a.day - b.day || a.hour.localeCompare(b.hour) || a.activity.localeCompare(b.activity))
      plan = {...plan, bloques: bloquesConsolidados}
    }
  setData(plan)
  if(showLoading) setLoading(false)
  }
  // Al cambiar agente/semana/año, limpiar estado y forzar fetch sin mezclar manuales previos
  useEffect(()=>{
    localManualRef.current = []
    lastSavedManualRef.current = ''
    setDirty(false)
    setData(null)
    // Forzar un fetch limpio para la nueva selección (sin merge de manuales)
    fetchData(true, 'manual')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[agenteId, semana, anio])

  // Cargar agentes para superuser
  useEffect(()=>{ if(superuser){ fetch('/api/agentes').then(r=> r.ok? r.json():[]).then(setAgentes).catch(()=>{}) } },[superuser])

  // Eventos y realtime relacionados con CITAS eliminados

  // Prevenir refresco/cierre de pestaña si hay cambios sin guardar
  useEffect(()=>{
    const beforeUnload = (e: BeforeUnloadEvent)=>{
      if(!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return ()=> window.removeEventListener('beforeunload', beforeUnload)
  },[dirty])

  // Cargar metas (usamos el valor de citas como proxy para SMNYL)
  const [metaSmnyl, setMetaSmnyl] = useState(5)
  useEffect(()=> { fetchFase2Metas().then(m=> setMetaSmnyl(m.metaCitas)) },[])

  const openModal=(day:number,hour:string, blk?:BloquePlanificacion)=>{ setModal({day,hour,blk}) }
  const closeModal=()=> setModal(null)

  const upsertBloque=(b:BloquePlanificacion|null)=>{
    if(!data) return
  const nuevos = data.bloques.filter(x=> !(x.day===modal?.day && x.hour===modal?.hour && x.origin!=='auto'))
    if(b) nuevos.push(b)
  const updated = {...data,bloques:nuevos}
  setData(updated)
  localManualRef.current = updated.bloques.filter(b=> b.origin!=='auto')
    setDirty(true)
  }

  const horasPlan = useMemo(()=>{
    const set = new Set(HORAS_BASE)
    if(data) data.bloques.forEach(b=> set.add(b.hour))
    return Array.from(set).sort()
  },[data])
  // Conteo de SMNYL para meta/progreso
  const horasSmnyl = data?.bloques.filter(b=> b.activity==='SMNYL' || b.activity==='CITAS').length || 0
  // Cálculo de "puedes ganar" = prima anual promedio * (porcentaje comisión/100) * bloques SMNYL
  const puedesGanar = (data?.prima_anual_promedio || 0) * ((data?.porcentaje_comision || 0) / 100) * horasSmnyl

  const guardar = async()=>{
    if(!data) return 
    if(semana==='ALL') return
    // Confirmación explícita si un superusuario está actuando sobre otro agente
    if (superuser) {
      const targetId = agenteId ? Number(agenteId) : null
      if (!targetId) { await dialog.alert('Seleccione un agente antes de guardar.'); return }
      if (user?.id && targetId !== user.id) {
        const proceed = await dialog.confirm(`Guardarás planificación para el agente #${targetId} como ${user.email}. ¿Confirmas?`, { icon: 'question-circle-fill' })
        if (!proceed) return
      }
    }
    const manual = data.bloques.filter(b=> b.origin!=='auto').sort((a,b)=> a.day-b.day || a.hour.localeCompare(b.hour) || a.activity.localeCompare(b.activity))
    const hash = JSON.stringify(manual)
    const body={
      agente_id: superuser && agenteId? Number(agenteId): undefined,
      semana_iso: semana as number,
      anio: anio,
      // Enviar todos los bloques (manual y auto) para congelar siempre el snapshot
      bloques: data.bloques.map(b=> ({...b})),
      prima_anual_promedio: data.prima_anual_promedio,
      porcentaje_comision: data.porcentaje_comision
    }
    const r=await fetch('/api/planificacion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    if(r.ok){
      setDirty(false)
      setToast({msg:'Planificación guardada', type:'success'})
  lastSavedManualRef.current = hash
  localManualRef.current = manual
  // Refrescar (forzado) para mergear correctamente tras persistir
  setTimeout(()=> fetchData(true,'postsave'), 400)
    } else {
      setToast({msg:'Error al guardar', type:'error'})
    }
  }

  return <div className="container py-4">
    <h2 className="fw-semibold mb-3">Planificación semanal</h2>
    {superuser && user && agenteId && Number(agenteId)!==user.id && (
      <div className="alert alert-warning py-2 small mb-2">
        Estás actuando como otro agente (objetivo: #{agenteId}). Todas las acciones quedarán registradas con tu usuario {user.email}.
      </div>
    )}
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
        <label className="form-label small mb-1">Agente</label>
        <select className="form-select form-select-sm" value={agenteId} onChange={e=>setAgenteId(e.target.value)}>
          <option value="">(Seleccionar agente)</option>
          {agentes.map(a=> <option key={a.id} value={a.id}>{a.nombre || a.email}</option>)}
        </select>
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
                  const isAuto = blk?.origin === 'auto'
                  const base=semanaDesdeNumero(anio, semana as number).inicio
                  // Construir fecha local evitando mezcla UTC/local
                  const cellDate = new Date(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()+day, Number(h), 0, 0, 0)
                  const isPast = cellDate.getTime() < Date.now() - 60000
                  const canEdit = !isPast && (!blk || !isAuto)
                  const color = (()=>{
                    if(!blk) return ''
                    if(blk.activity==='PROSPECCION') return 'bg-primary text-white'
                    if(blk.activity==='SMNYL') return 'bg-info text-dark'
                    if(blk.activity==='CITAS') return blk.confirmada ? 'bg-success text-white' : 'bg-warning text-dark'
                    return ''
                  })()
                  const titleParts: string[] = []
                  if(blk){
                    if(blk.activity==='PROSPECCION') titleParts.push('Prospección manual')
                    if(blk.activity==='SMNYL') titleParts.push(`Cita manual${blk.confirmada ? ' confirmada' : ''}`.trim())
                    if(blk.activity==='CITAS') titleParts.push(`Cita agenda${blk.confirmada ? ' confirmada' : ' por confirmar'}`)
                    if(blk.prospecto_nombre) titleParts.push(`Prospecto: ${blk.prospecto_nombre}`)
                    if(blk.prospecto_estado) titleParts.push(`Estado: ${blk.prospecto_estado}`)
                    if(blk.notas) titleParts.push(`Notas: ${blk.notas}`)
                  } else {
                    titleParts.push(isPast? 'Horario en el pasado' : 'Vacío')
                  }
                  const cellTitle = titleParts.join('\n')
                  const emptyPast = !blk && isPast
                  const cellClass = [color, emptyPast ? 'opacity-50' : '', !canEdit && blk ? 'position-relative' : ''].filter(Boolean).join(' ')
                  return <td key={day} style={{cursor: canEdit? 'pointer':'not-allowed', fontSize:'0.7rem'}} onClick={canEdit? ()=>openModal(day,h,blk): undefined} className={cellClass} title={cellTitle}>
                    {blk ? (
                      <div className="d-flex flex-column align-items-center gap-1 py-1" style={{minHeight:34}}>
                        <span className="fw-semibold" style={{fontSize:'0.68rem'}}>
                          {blk.activity==='PROSPECCION' && 'Prospección'}
                          {blk.activity==='SMNYL' && (blk.confirmada ? 'Cita manual (confirmada)' : 'Cita manual')}
                          {blk.activity==='CITAS' && (blk.confirmada ? 'Cita agenda (confirmada)' : 'Cita agenda')}
                        </span>
                        {blk.prospecto_nombre && <span className="text-wrap" style={{fontSize:'0.65rem'}}>{blk.prospecto_nombre}</span>}
                        {blk.activity!=='PROSPECCION' && (
                          <span className="badge rounded-pill bg-light text-dark" style={{fontSize:'0.55rem'}}>
                            {blk.prospecto_estado ? blk.prospecto_estado : (blk.confirmada ? 'confirmada' : 'por confirmar')}
                          </span>
                        )}
                      </div>
                    ) : (
                      emptyPast ? <span style={{fontSize:'0.55rem'}}>—</span> : null
                    )}
                  </td>
                })}
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="small text-muted mt-2 d-flex flex-wrap gap-3">
          <span><span className="badge bg-primary">Prospección</span></span>
          <span><span className="badge bg-info text-dark">Cita manual</span></span>
          <span><span className="badge bg-success">Cita agenda confirmada</span></span>
          <span><span className="badge bg-warning text-dark">Cita agenda por confirmar</span></span>
          <span>Click celda = editar / crear bloque manual</span>
        </div>
        <div className="alert alert-secondary small py-2 px-3 mt-2 mb-0">
          Las citas sincronizadas desde la agenda se muestran en verde o amarillo y son de solo lectura desde esta vista.
        </div>
      </div>
      <div className="col-lg-3">
        <div className="card p-3 shadow-sm">
          <div className="mb-1 small text-muted">Manual Prospecto: {data.bloques.filter(b=>b.origin!=='auto' && b.activity==='PROSPECCION').length}</div>
          <div className="mb-1 small text-muted">Manual Cita: {data.bloques.filter(b=>b.origin!=='auto' && b.activity==='SMNYL').length}</div>
          <div className="mb-2 small text-muted">Citas agenda: {data.bloques.filter(b=>b.origin==='auto' && b.activity==='CITAS').length}</div>
          <div className="mb-2 small">
            <label className="form-label small mb-1">Prima anual promedio</label>
            <div className="input-group input-group-sm">
              <span className="input-group-text">$</span>
              <input type="number" className="form-control" value={data.prima_anual_promedio} onChange={e=>setData({...data,prima_anual_promedio:Number(e.target.value)})}/>
            </div>
          </div>
          <div className="mb-2 small">
            <label className="form-label small mb-1">Porcentaje de comisión promedio</label>
            <div className="input-group input-group-sm">
              <span className="input-group-text">%</span>
              <input type="number" className="form-control" value={data.porcentaje_comision} onChange={e=>setData({...data,porcentaje_comision:Number(e.target.value)})}/>
            </div>
          </div>
          <div className="mb-2 small">Meta de citas semanal: {metaSmnyl}</div>
          <div className="progress mb-2" role="progressbar" aria-valuenow={horasSmnyl} aria-valuemin={0} aria-valuemax={metaSmnyl}>
            <div className={`progress-bar ${horasSmnyl>=metaSmnyl? 'bg-success':'bg-info'}`} style={{width: `${Math.min(100,(horasSmnyl/metaSmnyl)*100)}%`}}>{horasSmnyl}/{metaSmnyl}</div>
          </div>
          <div className="mb-3 fw-bold text-success fs-5">
            Puedes ganar: {(puedesGanar||0).toLocaleString('es-MX',{ style:'currency', currency:'MXN', minimumFractionDigits:2, maximumFractionDigits:2 })}
          </div>
          {/* Switch eliminado: ahora siempre se congelan todos los bloques (manual y auto) */}
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={loading || (typeof semana==='string') || !dirty}>Guardar</button>
          <div className="form-text small">{dirty? 'Cambios pendientes de guardar.':'Sin cambios.'}</div>
        </div>
      </div>
    </div>}
  {loading && <div>Cargando...</div>}
  {toast && <Notification message={toast.msg} type={toast.type} onClose={()=>setToast(null)} />}
  {modal && data && <AppModal title={(()=>{ const base=semanaDesdeNumero(anio, semana as number).inicio; const date=new Date(base); date.setUTCDate(base.getUTCDate()+modal.day); const dia=date.getUTCDate().toString().padStart(2,'0'); const mes=(date.getUTCMonth()+1).toString().padStart(2,'0'); return `${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][modal.day]} ${dia}/${mes} ${modal.hour}:00` })()} icon="calendar-event" onClose={closeModal}>
    <BloqueEditor modal={modal} semanaBase={semanaDesdeNumero(anio, semana as number).inicio} onSave={b=>{ upsertBloque(b); closeModal() }} onDelete={()=>{ upsertBloque(null); closeModal() }} />
  </AppModal>}
  </div>
}

function BloqueEditor({ modal, semanaBase, onSave, onDelete }: { modal:{day:number; hour:string; blk?:BloquePlanificacion}; semanaBase: Date; onSave:(b:BloquePlanificacion|null)=>void; onDelete:()=>void }){
  const dias = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
  const [tipo,setTipo]=useState< 'PROSPECCION'|'SMNYL' | ''>(modal.blk? (modal.blk.activity==='CITAS'? '' : modal.blk.activity) : '')
  const [notas,setNotas]=useState(modal.blk?.notas || '')
  const [confirmada, setConfirmada] = useState(modal.blk?.confirmada || false)
  const dialog = useDialog()
  const guardar=async()=>{
    if(!tipo){ onSave(null); return }
    // Bloquear guardar en pasado (recalcular con lógica local consistente)
    const target = new Date(semanaBase.getUTCFullYear(), semanaBase.getUTCMonth(), semanaBase.getUTCDate()+modal.day, Number(modal.hour), 0,0,0)
    if(target.getTime() < Date.now()-60000){ await dialog.alert('No se puede editar un bloque en el pasado'); return }
    // Notas opcionales
    const base: BloquePlanificacion = {day:modal.day, hour:modal.hour, activity:tipo, origin:'manual'}
    base.notas = notas.trim()
    if (tipo === 'SMNYL') base.confirmada = confirmada
    onSave(base)
  }
  const fechaBloque = new Date(semanaBase); fechaBloque.setUTCDate(fechaBloque.getUTCDate()+modal.day)
  const diaNum = fechaBloque.getUTCDate().toString().padStart(2,'0')
  const mesNum = (fechaBloque.getUTCMonth()+1).toString().padStart(2,'0')
  return <div className="small">
    <div className="mb-2 fw-semibold">{dias[modal.day]} {diaNum}/{mesNum} {modal.hour}:00</div>
    <div className="mb-2">
      <label className="form-label small mb-1">Tipo</label>
      <select className="form-select form-select-sm" value={tipo} onChange={e=> setTipo(e.target.value as 'PROSPECCION'|'SMNYL'|'') }>
        <option value="">(Vacío)</option>
        <option value="PROSPECCION">Prospección</option>
        <option value="SMNYL">Cita</option>
      </select>
    </div>
    {tipo === 'SMNYL' && (
      <div className="form-check form-switch mb-2">
        <input className="form-check-input" type="checkbox" id="cita-confirmada-toggle" checked={confirmada} onChange={e=>setConfirmada(e.target.checked)} />
        <label className="form-check-label" htmlFor="cita-confirmada-toggle">Cita confirmada</label>
      </div>
    )}
    {tipo && <div className="mb-2">
      <label className="form-label small mb-1">Notas (opcional)</label>
      <textarea rows={3} className="form-control form-control-sm" value={notas} onChange={e=> setNotas(e.target.value)} />
    </div>}
    <div className="d-flex gap-2 mt-3">
      <button className="btn btn-primary btn-sm" onClick={guardar} disabled={(()=>{ const t=new Date(semanaBase.getUTCFullYear(), semanaBase.getUTCMonth(), semanaBase.getUTCDate()+modal.day, Number(modal.hour),0,0,0); return t.getTime()<Date.now()-60000 })()}>Guardar</button>
      <button className="btn btn-outline-secondary btn-sm" onClick={()=> onSave(null)}>Vaciar</button>
      <button className="btn btn-outline-danger btn-sm ms-auto" onClick={onDelete}>Eliminar</button>
    </div>
  </div>
}