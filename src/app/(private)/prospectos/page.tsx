'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabaseClient'
import AppModal from '@/components/ui/AppModal'
import type { BloquePlanificacion } from '@/types'
import Notification from '@/components/ui/Notification'
import { useAuth } from '@/context/AuthProvider'
import type { Prospecto, ProspectoEstado } from '@/types'
import { ESTADO_CLASSES, ESTADO_LABEL, estadoOptions } from '@/lib/prospectosUI'
import { exportProspectosPDF } from '@/lib/prospectosExport'
import { computeExtendedMetrics, computePreviousWeekDelta } from '@/lib/prospectosMetrics'
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
  const [prevAgg,setPrevAgg]=useState<Aggregate|null>(null)
  const [estadoFiltro,setEstadoFiltro]=useState<ProspectoEstado|''>('')
  const [form,setForm]=useState({ nombre:'', telefono:'', notas:'', estado:'pendiente' as ProspectoEstado, fecha_cita:'', fecha_cita_fecha:'', fecha_cita_hora:'' })
  const [errorMsg,setErrorMsg]=useState<string>('')
  const [toast,setToast]=useState<{msg:string; type:'success'|'error'}|null>(null)
  const [horasOcupadas,setHorasOcupadas]=useState<Record<string,string[]>>({}) // fecha -> ['08','09']
  const [citaDrafts,setCitaDrafts]=useState<Record<number,{fecha?:string; hora?:string}>>({})
  const bcRef = useRef<BroadcastChannel|null>(null)

  const isPastDateHour = (fecha:string, hour:string)=>{
    const now = new Date()
    const [y,m,d] = fecha.split('-').map(Number)
    const dt = new Date(y, m-1, d, Number(hour), 0, 0, 0)
    return dt.getTime() < now.getTime()-60000 // margen 1 min
  }
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
  const [metaCitas,setMetaCitas]=useState(5)
  const [soloConCita,setSoloConCita]=useState(false)
  interface BloqueLite { day:number; hour:string; activity:string; origin?:string }
  interface PlanLite { bloques?: BloqueLite[] }
  const [conflicto,setConflicto]=useState<null|{prospecto:Prospecto; fechaLocal:string; horaLocal:string; semana:number; anio:number; day:number; plan:PlanLite; bloque:BloqueLite}> (null)
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
    // Cargar semana previa si aplica
    if(semana !== 'ALL'){
      const prev = (semana as number) - 1
      if(prev >= 1){
        const p2 = new URLSearchParams({ anio:String(anio), semana:String(prev) })
        if (superuser && agenteId) p2.set('agente_id', agenteId)
        const rPrev = await fetch('/api/prospectos/aggregate?'+p2.toString())
        if(rPrev.ok) setPrevAgg(await rPrev.json()); else setPrevAgg(null)
      } else setPrevAgg(null)
    } else setPrevAgg(null)
    setLoading(false)
  }

  useEffect(()=>{ fetchAll(); if(superuser) fetchAgentes() // eslint-disable-next-line react-hooks/exhaustive-deps
  },[estadoFiltro, agenteId, semana, anio, soloConCita])

  useEffect(()=> { fetchFase2Metas().then(m=> { setMetaProspectos(m.metaProspectos); setMetaCitas(m.metaCitas) }) },[])

  // BroadcastChannel fallback (cross-tab) para sincronizar si Realtime no llega
  useEffect(()=>{
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window){
        const bc = new BroadcastChannel('prospectos-sync')
        bcRef.current = bc
        bc.onmessage = (ev: MessageEvent)=>{
          if(ev.data === 'prospectos:cita-updated') fetchAll()
        }
        return ()=> { try { bc.close() } catch {} bcRef.current=null }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[superuser, agenteId, anio, semana, estadoFiltro, soloConCita])

  // Timezone helpers (CDMX). Desde 2022 sin DST: offset fijo -06.
  const MX_TZ = 'America/Mexico_City'
  const MX_UTC_OFFSET = 6 // UTC = local + 6 (cuando local es CDMX hora estándar)
  const buildUTCFromMX = (fecha:string,hora:string)=>{ // fecha YYYY-MM-DD, hora HH
    const [y,m,d] = fecha.split('-').map(Number)
    const h = Number(hora)
    return new Date(Date.UTC(y, m-1, d, h + MX_UTC_OFFSET, 0, 0)).toISOString()
  }
  const formatMXDate = (iso:string)=>{ try { return new Intl.DateTimeFormat('en-CA',{timeZone:MX_TZ, year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(iso)) } catch { return '' } }
  const formatMXHour = (iso:string)=>{ try { return new Intl.DateTimeFormat('es-MX',{timeZone:MX_TZ, hour:'2-digit', hour12:false}).format(new Date(iso)) } catch { return '' } }
  const submit=async(e:React.FormEvent)=>{e.preventDefault(); setErrorMsg(''); if(!form.nombre.trim()) return; const body: Record<string,unknown>={ nombre:form.nombre, telefono:form.telefono, notas:form.notas, estado:form.estado };
    if(form.fecha_cita_fecha && form.fecha_cita_hora){
      // Evitar guardar citas en el pasado al crear prospecto
      if(isPastDateHour(form.fecha_cita_fecha, form.fecha_cita_hora)){
        setErrorMsg('La fecha/hora de la cita no puede ser en el pasado');
        return;
      }
      body.fecha_cita = buildUTCFromMX(form.fecha_cita_fecha, form.fecha_cita_hora)
    }
    const r=await fetch('/api/prospectos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.ok){ setForm({nombre:'',telefono:'',notas:'',estado:'pendiente',fecha_cita:'',fecha_cita_fecha:'',fecha_cita_hora:''}); fetchAll(); setToast({msg:'Prospecto creado', type:'success'}) }
    else { try { const j=await r.json(); setErrorMsg(j.error||'Error'); setToast({msg:j.error||'Error', type:'error'}) } catch { setErrorMsg('Error al guardar'); setToast({msg:'Error al guardar', type:'error'}) } }
  }

  const update=(id:number, patch:Partial<Prospecto>, meta?: { prospecto: Prospecto; fechaLocal?: string; horaLocal?: string })=> {
    // debounce mínimo
    window.clearTimeout(debounceRef.current||0)
    debounceRef.current = window.setTimeout(()=>{
      const toSend:Record<string,unknown>={...patch}
      if(patch.fecha_cita){
        const fc=String(patch.fecha_cita)
        if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:00$/.test(fc)){
          const [fecha, hFull] = fc.split('T')
          const hora = hFull.slice(0,2)
          toSend.fecha_cita = buildUTCFromMX(fecha, hora)
        }
      }
  fetch('/api/prospectos/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(toSend)}).then(async r=>{ if(r.ok){ fetchAll(); window.dispatchEvent(new CustomEvent('prospectos:cita-updated')); try{ bcRef.current?.postMessage('prospectos:cita-updated') } catch {}; setToast({msg:'Actualizado', type:'success'})
          // Detectar conflicto solo si acabamos de asignar cita (no al borrar)
          if(patch.fecha_cita && meta?.fechaLocal && meta?.horaLocal){
            try {
              const fechaLocal = meta.fechaLocal; const horaLocal = meta.horaLocal
              const fechaObj = new Date(fechaLocal+'T'+horaLocal+':00')
              const { semana: semIso, anio: anioIso } = obtenerSemanaIso(fechaObj)
              // Obtener planificación de esa semana
              const params = new URLSearchParams({ semana:String(semIso), anio:String(anioIso), agente_id: String(meta.prospecto.agente_id) })
              const rPlan = await fetch('/api/planificacion?'+params.toString())
              if(rPlan.ok){
                const plan = await rPlan.json()
                // Calcular day index (0 lunes) usando semanaDesdeNumero
                const rango = semanaDesdeNumero(anioIso, semIso)
                const mondayUTC = rango.inicio
                const localMid = new Date(fechaObj.getFullYear(), fechaObj.getMonth(), fechaObj.getDate())
                const dayIdx = Math.floor( (localMid.getTime() - new Date(mondayUTC.getUTCFullYear(), mondayUTC.getUTCMonth(), mondayUTC.getUTCDate()).getTime()) / 86400000 )
                const blk = plan.bloques?.find((b: BloqueLite)=> b.day===dayIdx && b.hour===horaLocal)
                if(blk && blk.origin!== 'auto' && (blk.activity==='PROSPECCION' || blk.activity==='SMNYL')){
                  setConflicto({prospecto: meta.prospecto, fechaLocal, horaLocal, semana: semIso, anio: anioIso, day: dayIdx, plan, bloque: blk})
                }
              }
            } catch {/*ignore*/}
          }
        } else { try { const j=await r.json(); setToast({msg:j.error||'Error', type:'error'}) } catch { setToast({msg:'Error', type:'error'}) } } })
    },300)
  }

  // Realtime: escuchar cambios en tabla prospectos del agente actual (o todos si superuser+agenteId)
  useEffect(()=>{
    try {
      const supa = getSupabaseClient()
      const channel = supa.channel('prospectos-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prospectos' }, payload => {
          // Si hay filtros por agente, evitamos refrescos innecesarios en otros agentes
          const row = (payload.new || payload.old) as Partial<Prospecto> | undefined
          if(superuser && agenteId){
            if(row && 'agente_id' in row && Number(row.agente_id) !== Number(agenteId)) return
          }
          // Refrescar vista manteniendo filtros
          fetchAll()
        })
        .subscribe()
      return ()=> { supa.removeChannel(channel) }
    } catch { /* ignore missing config at build */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[superuser, agenteId, anio, semana, estadoFiltro, soloConCita])

  // Validaciones extra: formato teléfono y posible duplicado por nombre
  const telefonoValido = (v:string)=> !v || /^\+?[0-9\s-]{7,15}$/.test(v)
  const posibleDuplicado = (nombre:string)=> {
    const n = nombre.trim().toLowerCase()
    if(!n) return false
    return prospectos.some(p=> p.nombre.trim().toLowerCase()===n)
  }
  const nombreDuplicado = posibleDuplicado(form.nombre)
  const telefonoInvalido = !telefonoValido(form.telefono)

  // Eliminación completa de prospectos deshabilitada (solo borrar cita) según requerimiento.
  const borrarCita = async(p:Prospecto)=>{
    if(!p.fecha_cita) return
    if(!confirm('¿Borrar cita? Se eliminará también el bloque en planificación.')) return
    const patch: Partial<Prospecto & {estado?: ProspectoEstado}> = { fecha_cita: null }
    if(p.estado==='con_cita') patch.estado='pendiente'
    fetch('/api/prospectos/'+p.id,{method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch)}).then(async r=>{
      if(r.ok){
        // Eliminar bloque auto de planificación correspondiente
        try {
          if(semana !== 'ALL'){
            const semanaIso = semana as number
            const params = { prospecto_id: p.id, semana_iso: semanaIso, anio: anio, agente_id: p.agente_id }
            await fetch('/api/planificacion/remove_cita',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(params)})
          }
        } catch {/* ignore */}
  fetchAll(); window.dispatchEvent(new CustomEvent('prospectos:cita-updated')); try{ bcRef.current?.postMessage('prospectos:cita-updated') } catch {}; setToast({msg:'Cita eliminada', type:'success'})
      } else { try { const j=await r.json(); setToast({msg:j.error||'Error', type:'error'}) } catch { setToast({msg:'Error', type:'error'}) } }
    })
  }

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
  <button type="button" disabled={!prospectos.length} className="btn btn-outline-secondary btn-sm" onClick={async ()=>{
    const agrupado = superuser && !agenteId
    const agentesMap = agentes.reduce<Record<number,string>>((acc,a)=>{ acc[a.id]= a.nombre||a.email; return acc },{})
    const semanaLabel = semana==='ALL'? 'Año completo' : (()=>{ const r=semanaDesdeNumero(anio, semana as number); return `Semana ${semana} (${formatearRangoSemana(r)})` })()
    const agName = agrupado? 'Todos' : (agentes.find(a=> String(a.id)===agenteId)?.nombre || agentes.find(a=> String(a.id)===agenteId)?.email || '')
    const general = agrupado
    const titulo = general ? `Reporte de prospectos General ${semanaLabel}` : `Reporte de prospectos Agente: ${agName || 'N/A'} ${semanaLabel}`
    const filename = general
      ? `Reporte_de_prospectos_General_semana_${semana==='ALL'?'ALL':semana}_${semanaLabel.replace(/[^0-9_-]+/g,'')}`
      : `Reporte_de_prospectos_Agente_${(agName||'NA').replace(/\s+/g,'_')}_semana_${semana==='ALL'?'ALL':semana}_${semanaLabel.replace(/[^0-9_-]+/g,'')}`
  const hoy = new Date(); const diaSemanaActual = hoy.getDay()===0?7:hoy.getDay()
  if(agrupado){
    const perAgent: Record<number, ReturnType<typeof computeExtendedMetrics>> = {}
    const grouped = prospectos.reduce<Record<number,Prospecto[]>>((acc,p)=>{ (acc[p.agente_id] ||= []).push(p); return acc },{})
    for(const [agId, list] of Object.entries(grouped)) perAgent[Number(agId)] = computeExtendedMetrics(list,{ diaSemanaActual })
    // Obtener planificación por agente (en paralelo)
    let planningSummaries: Record<number,{ prospeccion:number; citas:number; smnyl:number; total:number }> | undefined
    try {
      const weekNum = semana==='ALL'? undefined : (semana as number)
      if(weekNum){
        const responses = await Promise.all(Object.keys(grouped).map(async id=>{
          const params = new URLSearchParams({ agente_id:String(id), semana:String(weekNum), anio:String(anio) })
          try { const r = await fetch('/api/planificacion?'+params.toString()); if(r.ok) return { id:Number(id), data: await r.json() }; } catch {/*ignore*/}
          return { id:Number(id), data:null }
        }))
        planningSummaries = {}
        for(const {id,data} of responses){ if(data){
          const counts = { prospeccion:0, citas:0, smnyl:0 }
          for(const b of (data.bloques||[])){ if(b.activity==='PROSPECCION') counts.prospeccion++; else if(b.activity==='CITAS') counts.citas++; else if(b.activity==='SMNYL') counts.smnyl++; }
          planningSummaries[id] = { ...counts, total: counts.prospeccion+counts.citas+counts.smnyl }
        }}
      }
    } catch {/* ignore planning errors */}
    // Calcular deltas reales por agente contra semana anterior
    let perAgentDeltas: Record<number,{ totalDelta:number; citasDelta:number }> | undefined
    if(prevAgg && agg && semana !== 'ALL'){
      const prevWeek = (semana as number) - 1
      if(prevWeek >= 1){
        perAgentDeltas = {}
        const agentIds = Object.keys(grouped)
        try {
          const prevResponses = await Promise.all(agentIds.map(async id=>{
            const params = new URLSearchParams({ anio:String(anio), semana:String(prevWeek), agente_id:String(id) })
            try { const r = await fetch('/api/prospectos/aggregate?'+params.toString()); if(r.ok) return { id, data: await r.json() as Aggregate }; } catch {/*ignore*/}
            return { id, data: null as Aggregate|null }
          }))
          for(const {id,data} of prevResponses){
            if(!data){ continue } // sin datos previos mostramos '-'
            const currentList = grouped[Number(id)] || []
            const currentTotal = currentList.length
            const currentCitas = currentList.filter(p=> p.estado==='con_cita').length
            const prevTotal = data.total || 0
            const prevCitas = data.por_estado?.con_cita || 0
            perAgentDeltas[Number(id)] = { totalDelta: currentTotal - prevTotal, citasDelta: currentCitas - prevCitas }
          }
        } catch { /* ignorar errores de delta */ }
      }
    }
  exportProspectosPDF(prospectos, agg || {total:0,por_estado:{},cumplimiento_30:false}, titulo, { incluirId:false, agrupadoPorAgente: agrupado, agentesMap, chartEstados: true, metaProspectos, metaCitas, forceLogoBlanco:true, perAgentExtended: perAgent, prevWeekDelta: agg && prevAgg? computePreviousWeekDelta(agg, prevAgg): undefined, filename, perAgentDeltas, planningSummaries })
  } else {
    // Filtrar por agente seleccionado explícitamente para evitar incluir otros
    const filtered = (superuser && agenteId)? prospectos.filter(p=> p.agente_id === Number(agenteId)) : prospectos
    const resumenLocal = (()=>{
      const counts: Record<string,number> = { pendiente:0, seguimiento:0, con_cita:0, descartado:0 }
      for(const p of filtered){ if(counts[p.estado]!==undefined) counts[p.estado]++ }
      return { total: filtered.length, por_estado: counts, cumplimiento_30: filtered.length>=30 }
    })()
    const extended = computeExtendedMetrics(filtered,{ diaSemanaActual })
    // Planificación single agente
  let singleAgentPlanning: { bloques:BloquePlanificacion[]; summary:{ prospeccion:number; citas:number; smnyl:number; total:number } } | undefined
    try {
      if(agenteId && semana!=='ALL'){
        const params = new URLSearchParams({ agente_id:String(agenteId), semana:String(semana), anio:String(anio) })
        const rPlan = await fetch('/api/planificacion?'+params.toString())
        if(rPlan.ok){
          const data = await rPlan.json()
          const counts = { prospeccion:0, citas:0, smnyl:0 }
          for(const b of (data.bloques||[])){ if(b.activity==='PROSPECCION') counts.prospeccion++; else if(b.activity==='CITAS') counts.citas++; else if(b.activity==='SMNYL') counts.smnyl++; }
          singleAgentPlanning = { bloques: data.bloques||[], summary: { ...counts, total: counts.prospeccion+counts.citas+counts.smnyl } }
        }
      }
    } catch {/*ignore*/}
  exportProspectosPDF(filtered, resumenLocal, titulo, { incluirId:false, agrupadoPorAgente: agrupado, agentesMap, chartEstados: true, metaProspectos, metaCitas, forceLogoBlanco:true, extendedMetrics: extended, prevWeekDelta: agg && prevAgg? computePreviousWeekDelta(agg, prevAgg): undefined, filename, singleAgentPlanning })
  }
  }}>PDF</button>
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
          {!superuser && (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=> { const agrupado=false; const agentesMap = agentes.reduce<Record<number,string>>((acc,a)=>{ acc[a.id]= a.nombre||a.email; return acc },{}); const semanaLabel = semana==='ALL'? 'Año completo' : (()=>{ const r=semanaDesdeNumero(anio, semana as number); return `Semana ${semana} (${formatearRangoSemana(r)})` })(); const agName = agentes.find(a=> String(a.id)===agenteId)?.nombre || agentes.find(a=> String(a.id)===agenteId)?.email || ''; const titulo = `Reporte de prospectos Agente: ${agName || 'N/A'} ${semanaLabel}`; const hoy=new Date(); const diaSemanaActual = hoy.getDay()===0?7:hoy.getDay(); const filtered = (superuser && agenteId)? prospectos.filter(p=> p.agente_id === Number(agenteId)) : prospectos; const extended = computeExtendedMetrics(filtered,{ diaSemanaActual }); const filename = `Reporte_de_prospectos_Agente_${(agName||'NA').replace(/\s+/g,'_')}_semana_${semana==='ALL'?'ALL':semana}_${semanaLabel.replace(/[^0-9_-]+/g,'')}`; const resumenLocal = (()=>{ const counts: Record<string,number> = { pendiente:0, seguimiento:0, con_cita:0, descartado:0 }; for(const p of filtered){ if(counts[p.estado]!==undefined) counts[p.estado]++ } return { total: filtered.length, por_estado: counts, cumplimiento_30: filtered.length>=30 } })(); exportProspectosPDF(filtered, resumenLocal, titulo,{incluirId:false, agrupadoPorAgente: agrupado, agentesMap, chartEstados:true, metaProspectos, metaCitas, forceLogoBlanco:true, extendedMetrics: extended, prevWeekDelta: agg && prevAgg? computePreviousWeekDelta(agg, prevAgg): undefined, filename }) }}>PDF</button>
          )}
        </div>
        {(!superuser || (superuser && agenteId)) && <div style={{minWidth:260}} className="progress" role="progressbar" aria-valuenow={agg.total} aria-valuemin={0} aria-valuemax={metaProspectos}>
          <div className={`progress-bar ${agg.total>=metaProspectos? 'bg-success':'bg-warning text-dark'}`} style={{width: `${Math.min(100, (agg.total/metaProspectos)*100)}%`}}>{agg.total}/{metaProspectos}</div>
        </div>}
      </div>}
    </div>
  <form onSubmit={submit} className="card p-3 mb-4 shadow-sm">
      <div className="row g-2">
        <div className="col-sm-3">
          <input required value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre" className="form-control"/>
          {nombreDuplicado && <div className="form-text text-warning small">Nombre ya existe en la lista actual.</div>}
        </div>
        <div className="col-sm-2">
          <input value={form.telefono} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} placeholder="Teléfono" className={`form-control ${telefonoInvalido? 'is-invalid':''}`}/>
          {telefonoInvalido && <div className="invalid-feedback">Teléfono inválido. Use 7-15 dígitos, opcional +, espacios o guiones.</div>}
        </div>
        <div className="col-sm-3"><input value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Notas" className="form-control"/></div>
        <div className="col-sm-2"><select value={form.estado} onChange={e=>setForm(f=>({...f,estado:e.target.value as ProspectoEstado}))} className="form-select">{estadoOptions().map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
  <div className="col-sm-1"><input type="date" value={form.fecha_cita_fecha} onChange={e=>{ const fecha=e.target.value; setForm(f=>({...f,fecha_cita_fecha:fecha})); if(fecha) precargarHoras(fecha) }} className="form-control"/></div>
  <div className="col-sm-1"><select className="form-select" value={form.fecha_cita_hora} onChange={e=>setForm(f=>({...f,fecha_cita_hora:e.target.value}))}><option value="">(Hora)</option>{Array.from({length:24},(_,i)=> i).map(h=> { const hh=String(h).padStart(2,'0'); const ocup = !!(form.fecha_cita_fecha && horasOcupadas[form.fecha_cita_fecha]?.includes(hh)); return <option key={h} value={hh} disabled={ocup}>{hh}:00{ocup?' (X)':''}</option>})}</select></div>
      </div>
  <div className="mt-2"><button className="btn btn-primary btn-sm" disabled={loading || telefonoInvalido}>Agregar</button></div>
      {errorMsg && <div className="text-danger small mt-2">{errorMsg}</div>}
    </form>
    <div className="table-responsive">
  <table className="table table-sm align-middle">
	<thead><tr><th>Nombre</th><th>Teléfono</th><th>Notas</th><th>Estado</th><th>Cita</th><th></th></tr></thead>
        <tbody>
      {prospectos.map(p=> <tr key={p.id}>
    <td><span className={'d-inline-block px-2 py-1 rounded '+ESTADO_CLASSES[p.estado]}>{p.nombre}</span></td>
            <td>{p.telefono||''}</td>
            <td style={{maxWidth:180}}><input value={p.notas||''} onChange={e=>update(p.id,{notas:e.target.value})} className="form-control form-control-sm"/></td>
            <td>
              <select value={p.estado} onChange={e=>update(p.id,{estado:e.target.value as ProspectoEstado})} className="form-select form-select-sm">
                {estadoOptions().map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </td>
            <td style={{minWidth:170}}>
              {(()=>{ const pad=(n:number)=>String(n).padStart(2,'0');
                const draft = citaDrafts[p.id] || {}
                const dateVal = p.fecha_cita? formatMXDate(p.fecha_cita): (draft.fecha||'')
                const hourVal = p.fecha_cita? formatMXHour(p.fecha_cita): (draft.hora||'')
                const setDraft=(partial: {fecha?:string; hora?:string})=> setCitaDrafts(prev=> ({...prev, [p.id]: {...prev[p.id], ...partial}}))
                return <div className="d-flex gap-1 flex-column">
                  <div className="d-flex gap-1">
                    <input type="date" value={dateVal} min={new Date().toISOString().slice(0,10)} onChange={e=>{ const newDate=e.target.value; if(!newDate){ setDraft({fecha:undefined}); update(p.id,{fecha_cita:null, estado: p.estado==='con_cita'? 'pendiente': p.estado}); return }
                      setDraft({fecha:newDate}); if(hourVal && !isPastDateHour(newDate, hourVal)){ const patch: Partial<Prospecto & {estado?: ProspectoEstado}> = {fecha_cita:`${newDate}T${hourVal}:00`}; if(p.estado!=='con_cita') patch.estado='con_cita'; update(p.id,patch,{ prospecto:p, fechaLocal:newDate, horaLocal:hourVal }); setCitaDrafts(prev=> { const cp={...prev}; delete cp[p.id]; return cp }) } }} className="form-control form-control-sm"/>
                    <select className="form-select form-select-sm" value={hourVal} onChange={e=>{ const h=e.target.value; if(!h){ setDraft({hora:undefined}); update(p.id,{fecha_cita:null, estado: p.estado==='con_cita'? 'pendiente': p.estado}); return }
                      if(dateVal && isPastDateHour(dateVal, h)) { setToast({msg:'Hora en el pasado', type:'error'}); return }
                      setDraft({hora:h}); if(dateVal){ const patch: Partial<Prospecto & {estado?: ProspectoEstado}>={fecha_cita:`${dateVal}T${h}:00`}; if(p.estado!=='con_cita') patch.estado='con_cita'; update(p.id,patch,{ prospecto:p, fechaLocal:dateVal, horaLocal:h }); setCitaDrafts(prev=> { const cp={...prev}; delete cp[p.id]; return cp }) } }}>
                      <option value="">--</option>
                      {Array.from({length:24},(_,i)=> i).map(h=> { const hh=pad(h); const disabled = dateVal? isPastDateHour(dateVal, hh): false; return <option key={h} value={hh} disabled={disabled}>{hh}:00{disabled?' (pasado)':''}</option>})}
                    </select>
                  </div>
                  {/* Texto detalle de día/ hora ocultado según solicitud */}
                </div> })()}
            </td>
            <td className="text-nowrap">
              {p.fecha_cita && <button onClick={()=>borrarCita(p)} className="btn btn-sm btn-warning text-dark" title="Borrar cita">Borrar cita</button>}
            </td>
          </tr>)}
          {(!loading && prospectos.length===0) && <tr><td colSpan={7} className="text-center py-4 text-muted">No hay prospectos para los filtros actuales.</td></tr>}
        </tbody>
      </table>
      {loading && <div className="p-3">Cargando...</div>}
    </div>
    {toast && <Notification message={toast.msg} type={toast.type} onClose={()=>setToast(null)} />}
    {conflicto && <AppModal title="Conflicto de bloque" icon="exclamation-triangle" onClose={()=> setConflicto(null)}>
      <div className="small">
        <p className="mb-3">Existe un bloque <strong>{conflicto.bloque.activity}</strong> en la planificación para <strong>{conflicto.fechaLocal}</strong> a las <strong>{conflicto.horaLocal}:00</strong>. ¿Reemplazarlo por la cita del prospecto <strong>{conflicto.prospecto.nombre}</strong>?</p>
        <div className="d-flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={async ()=>{
            try {
              const plan = conflicto.plan || { bloques: [] }
              const bloques = (plan.bloques||[]).filter(b=> !(b.day===conflicto.day && b.hour===conflicto.horaLocal))
              bloques.push({ day:conflicto.day, hour:conflicto.horaLocal, activity:'CITAS', origin:'manual' })
              const body = { agente_id: conflicto.prospecto.agente_id, semana_iso: conflicto.semana, anio: conflicto.anio, bloques }
              await fetch('/api/planificacion',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
              setConflicto(null)
              window.dispatchEvent(new CustomEvent('prospectos:cita-updated'))
              setToast({msg:'Bloque reemplazado por cita', type:'success'})
            } catch {
              setToast({msg:'Error al reemplazar bloque', type:'error'})
              setConflicto(null)
            }
          }}>Reemplazar bloque</button>
          <button className="btn btn-outline-secondary btn-sm" onClick={()=> setConflicto(null)}>Mantener</button>
        </div>
      </div>
    </AppModal>}
  </div>
}
