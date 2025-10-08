'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { getSupabaseClient } from '@/lib/supabaseClient'
import AppModal from '@/components/ui/AppModal'
import type { BloquePlanificacion } from '@/types'
import Notification from '@/components/ui/Notification'
import { useAuth } from '@/context/AuthProvider'
import type { Prospecto, ProspectoEstado } from '@/types'
import { ESTADO_CLASSES, ESTADO_LABEL, estadoOptions } from '@/lib/prospectosUI'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import { exportProspectosPDF, pngToBase64 } from '@/lib/prospectosExport'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { computeExtendedMetrics, computePreviousWeekDelta } from '@/lib/prospectosMetrics'
import { fetchFase2Metas } from '@/lib/fase2Params'
import { obtenerSemanaIso, formatearRangoSemana, semanaDesdeNumero } from '@/lib/semanaIso'
// Modal creación rápida de cliente al convertir prospecto a 'ya_es_cliente'

interface NuevoClienteDraft {
  primer_nombre: string
  segundo_nombre: string
  primer_apellido: string
  segundo_apellido: string
  telefono_celular: string
  email: string
  fecha_nacimiento?: string
}

interface Aggregate { total:number; por_estado: Record<string,number>; cumplimiento_30:boolean }
 
export default function ProspectosPage(){
  const { user } = useAuth()
  const semanaActual = useMemo(()=>obtenerSemanaIso(new Date()),[])
  const [anio,setAnio]=useState(semanaActual.anio)
  // Semana puede ser número ISO o 'ALL' para todo el año
  const [semana,setSemana]=useState<number|"ALL">(semanaActual.semana)
  const [prospectos,setProspectos]=useState<Prospecto[]>([])
  const [yearProspectos,setYearProspectos]=useState<Prospecto[]|null>(null)
  const [busqueda,setBusqueda]=useState('')
  // Derivados para separación de semanas
  // Semana fija para meta: siempre la semana actual del calendario, independientemente del filtro seleccionado
  const metaWeek = semanaActual.semana
  const sourceAll = yearProspectos || prospectos
  // En la nueva lógica de reporte ya NO mezclamos semanas previas; mantenemos referencias pero se usarán solo para tabla secundaria
  // Semana activa para UI y exportación: la seleccionada
  const semanaActiva = semana === 'ALL' ? null : Number(semana)
  // Prospectos de la semana seleccionada
  const actuales = useMemo(() =>
    semanaActiva == null
      ? []
      : sourceAll.filter(p => p.anio === anio && p.semana_iso === semanaActiva),
    [sourceAll, semanaActiva, anio]
  )
  // Prospectos de semanas anteriores a la seleccionada
  const activosPrevios = useMemo(() =>
    semanaActiva == null
      ? []
      : sourceAll.filter(p => p.anio === anio && p.semana_iso < semanaActiva && ['pendiente', 'seguimiento', 'con_cita'].includes(p.estado)),
    [sourceAll, semanaActiva, anio]
  )
  const [showPrevios,setShowPrevios]=useState(false)
  const [loading,setLoading]=useState(false)
  const yearCacheRef = useRef<Record<string,Prospecto[]>>({}) // key: anio|agenteId
  const [agg,setAgg]=useState<Aggregate|null>(null)
  const [prevAgg,setPrevAgg]=useState<Aggregate|null>(null)
  // Conteos mostrados en badges: revertido a lógica original (solo semana seleccionada / agg directo)
  const displayData = useMemo(()=>{
    if(!agg) return { total:0, por_estado:{} as Record<string,number> }
    return { total: agg.total, por_estado: { ...agg.por_estado } }
  },[agg])
  const [estadoFiltro,setEstadoFiltro]=useState<ProspectoEstado|''>('')
  const [form,setForm]=useState({ nombre:'', telefono:'', notas:'', estado:'pendiente' as ProspectoEstado })
  const [errorMsg,setErrorMsg]=useState<string>('')
  const [toast,setToast]=useState<{msg:string; type:'success'|'error'}|null>(null)
  const bcRef = useRef<BroadcastChannel|null>(null)
  // Evitar envíos duplicados por doble click
  const [saving,setSaving] = useState(false)
  const submittingRef = useRef(false)
  
  const [agenteId,setAgenteId]=useState<string>('')
  const [agentes,setAgentes]=useState<Array<{id:number; nombre?:string; email:string}>>([])
  // const debounceRef = useRef<number|null>(null) // ya no se usa con edición en modal
  const [metaProspectos,setMetaProspectos]=useState(30)
  
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
      try {
        const data = await r.json()
        const list = Array.isArray(data) ? data : (data?.agentes || [])
        setAgentes(list)
      } catch {/* ignore parse */}
    }
  }

  const fetchAll = async()=>{
    setLoading(true)
    const weekParams = new URLSearchParams()
    weekParams.set('anio', String(anio))
    if(semana !== 'ALL') weekParams.set('semana', String(semana))
    if(superuser && agenteId) weekParams.set('agente_id', String(agenteId))
  // filtro de estado ahora sólo es local (no se manda al backend)
    // Lanzar fetch semana
    const weekPromise = fetch('/api/prospectos?'+weekParams.toString())
    // Si semana === 'ALL', reutilizaremos lista semanal como year
    const needYear = semana !== 'ALL'
    const cacheKey = anio+ '|' + (superuser? (agenteId||'ALL'): 'SELF')
    let yearPromise: Promise<Response>|null = null
    if(needYear){
      if(yearCacheRef.current[cacheKey]){
        setYearProspectos(yearCacheRef.current[cacheKey])
      } else {
  // indicador de carga anual omitido para no bloquear UI
        const yearParams = new URLSearchParams(); yearParams.set('anio', String(anio)); if(superuser && agenteId) yearParams.set('agente_id', String(agenteId))
        yearPromise = fetch('/api/prospectos?'+yearParams.toString())
      }
    } else {
      setYearProspectos(null) // no se necesita lista separada
    }
    try {
      // Resolver semana
      const r = await weekPromise
      if(r.ok){
        const data = await r.json(); const list: Prospecto[] = Array.isArray(data)? data : (data?.items||[])
        setProspectos(list)
  const counts: Record<string,number> = { pendiente:0, seguimiento:0, con_cita:0, descartado:0, ya_es_cliente:0 }
        for(const p of list){ if(counts[p.estado] !== undefined) counts[p.estado]++ }
  setAgg({ total: list.length, por_estado: counts, cumplimiento_30: list.length >= 30 })
        if(semana !== 'ALL'){
          const prevWeek = (semana as number) - 1
          if(prevWeek >= 1){
            try {
              const q = new URLSearchParams({ anio:String(anio), semana:String(prevWeek) })
              if(superuser && agenteId) q.set('agente_id', String(agenteId))
              const rPrev = await fetch('/api/prospectos/aggregate?'+q.toString())
              if(rPrev.ok){ setPrevAgg(await rPrev.json() as Aggregate) } else { setPrevAgg(null) }
            } catch { setPrevAgg(null) }
          } else setPrevAgg(null)
        } else setPrevAgg(null)
        // Reutilizar para year si ALL
        if(semana === 'ALL') yearCacheRef.current[cacheKey] = list
      } else {
        setProspectos([]); setAgg({ total:0, por_estado:{}, cumplimiento_30:false }); setPrevAgg(null)
      }
      // Resolver year si corresponde y no caché
      if(yearPromise){
        try {
          const ry = await yearPromise
          if(ry.ok){ const dY = await ry.json(); const listY: Prospecto[] = Array.isArray(dY)? dY : (dY?.items||[]); yearCacheRef.current[cacheKey]=listY; setYearProspectos(listY) }
          else if(!yearCacheRef.current[cacheKey]) setYearProspectos(null)
  } finally { /* fin carga anual */ }
      }
    } finally { setLoading(false) }
  }

  useEffect(()=>{ fetchAll(); if(superuser) fetchAgentes() // eslint-disable-next-line react-hooks/exhaustive-deps
  },[agenteId, semana, anio])

  useEffect(()=> { fetchFase2Metas().then(m=> { setMetaProspectos(m.metaProspectos) }) },[])

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
  },[superuser, agenteId, anio, semana])

  // Timezone helpers (CDMX). Desde 2022 sin DST: offset fijo -06.
  // const MX_UTC_OFFSET = 6
  // const buildUTCFromMX = (fecha:string,hora:string)=>{ /* obsoleto: edición modal no toca fecha_cita */ }
  
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setSaving(true)
    setErrorMsg('')
    if(!form.nombre.trim()) { setSaving(false); submittingRef.current = false; return }
    const body: Record<string,unknown>={ nombre:form.nombre, telefono:form.telefono, notas:form.notas, estado:form.estado };
    // Si superusuario/admin y se eligió agente en el selector superior, enviar agente_id para asignación
    if (superuser && agenteId) body.agente_id = Number(agenteId)
    // Ya no se agenda cita durante el registro
    try {
      const r=await fetch('/api/prospectos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(r.ok){ setForm({nombre:'',telefono:'',notas:'',estado:'pendiente'}); fetchAll(); setToast({msg:'Prospecto creado', type:'success'}) }
      else { try { const j=await r.json(); setErrorMsg(j.error||'Error'); setToast({msg:j.error||'Error', type:'error'}) } catch { setErrorMsg('Error al guardar'); setToast({msg:'Error al guardar', type:'error'}) } }
  } finally { setSaving(false); submittingRef.current = false }
  }

  // update() inline de campos reemplazado por edición vía modal

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
  },[superuser, agenteId, anio, semana])

  // Validaciones extra: formato teléfono y posible duplicado por nombre
  const telefonoValido = (v:string)=> !v || /^\+?[0-9\s-]{7,15}$/.test(v)
  const posibleDuplicado = (nombre:string)=> {
    const n = nombre.trim().toLowerCase()
    if(!n) return false
    return prospectos.some(p=> p.nombre.trim().toLowerCase()===n)
  }
  const nombreDuplicado = posibleDuplicado(form.nombre)
  const telefonoInvalido = !telefonoValido(form.telefono)

  // Modal de edición de prospecto
  const [editTarget, setEditTarget] = useState<Prospecto|null>(null)
  const [editForm, setEditForm] = useState<{ nombre:string; telefono:string; notas:string; estado:string }>({ nombre:'', telefono:'', notas:'', estado:'pendiente' })
  // Estado para modal de nuevo cliente
  const [showNuevoCliente, setShowNuevoCliente] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState<NuevoClienteDraft>({ primer_nombre:'', segundo_nombre:'', primer_apellido:'', segundo_apellido:'', telefono_celular:'', email:'' })
  const [savingCliente, setSavingCliente] = useState(false)
  const [clienteError, setClienteError] = useState<string>('')
  const [clienteSuccess, setClienteSuccess] = useState<string>('')
  // Estado para conversión diferida: guardamos el prospecto al que se le quiso cambiar a 'ya_es_cliente'
  const [pendingConversionProspect, setPendingConversionProspect] = useState<Prospecto|null>(null)

  const openNuevoClienteFromProspecto = (p: Prospecto|null) => {
    // Abrir modal SIN prellenar ningún campo (requerimiento)
    setNuevoCliente({ primer_nombre:'', segundo_nombre:'', primer_apellido:'', segundo_apellido:'', telefono_celular:'', email:'' })
    setClienteError(''); setClienteSuccess('')
    if(p) setPendingConversionProspect(p)
    setShowNuevoCliente(true)
  }

  const submitNuevoCliente = async () => {
    if (savingCliente) return
    setSavingCliente(true)
    setClienteError(''); setClienteSuccess('')
    const { primer_nombre, primer_apellido, segundo_apellido, telefono_celular, email } = nuevoCliente
    if (!primer_nombre.trim() || !primer_apellido.trim() || !segundo_apellido.trim() || !telefono_celular.trim() || !email.trim()) {
      setClienteError('Completa los campos requeridos (nombres, apellidos, teléfono, email).')
      setSavingCliente(false)
      return
    }
    try {
      const payload: Record<string, unknown> = {
        primer_nombre: primer_nombre.trim(),
        segundo_nombre: nuevoCliente.segundo_nombre.trim() || null,
        primer_apellido: primer_apellido.trim(),
        segundo_apellido: segundo_apellido.trim(),
        telefono_celular: telefono_celular.trim(),
        email: email.trim().toLowerCase(),
      }
      if (nuevoCliente.fecha_nacimiento) payload.fecha_nacimiento = nuevoCliente.fecha_nacimiento
      const r = await fetch('/api/clientes', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
      const j = await r.json().catch(()=> ({}))
      if (!r.ok) {
        setClienteError(j.error || 'Error al crear cliente')
      } else {
        setClienteSuccess('Cliente creado correctamente.')
        setToast({ msg: 'Cliente creado', type:'success' })
        // Segunda fase: actualizar prospecto a ya_es_cliente (si aún existe pendiente)
        if(pendingConversionProspect){
          try {
            const resp = await fetch('/api/prospectos/'+pendingConversionProspect.id, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ estado:'ya_es_cliente' }) })
            if(!resp.ok){
              try { const j2 = await resp.json(); setToast({ msg: 'Cliente creado pero error al actualizar prospecto: '+(j2.error||'Error'), type:'error' }) } catch { setToast({ msg:'Cliente creado pero error al actualizar prospecto', type:'error' }) }
            } else {
              fetchAll()
            }
          } catch { setToast({ msg:'Cliente creado pero error al actualizar prospecto', type:'error' }) }
        }
        setPendingConversionProspect(null)
        // Cerrar modal tras breve delay
        setTimeout(()=>{ setShowNuevoCliente(false) }, 900)
      }
    } catch {
      setClienteError('Error inesperado al crear cliente')
    } finally { setSavingCliente(false) }
  }
  const openEdit = (p: Prospecto) => {
    setEditTarget(p)
    setEditForm({
      nombre: p.nombre || '',
      telefono: p.telefono || '',
      notas: p.notas || '',
      estado: p.estado
    })
  }
  const closeEdit = () => { setEditTarget(null) }
  const saveEdit = async () => {
    if (!editTarget) return
    // Si ya está convertido, no permitir edición
    if (editTarget.estado === 'ya_es_cliente') { setToast({ msg:'Prospecto ya convertido. No editable.', type:'error' }); closeEdit(); return }
    // ProspectoEstado ya incluye 'ya_es_cliente'; comparar directamente
  const currentEstado = editTarget.estado as unknown as string
  const newEstado = editForm.estado as unknown as string
  const wasCliente = currentEstado === 'ya_es_cliente'
  const newIsCliente = newEstado === 'ya_es_cliente'
    const convertingToCliente = newIsCliente && !wasCliente
    const patch: Partial<Prospecto> = {}
    if (editForm.nombre.trim() !== (editTarget.nombre||'').trim()) patch.nombre = editForm.nombre.trim()
    if ((editForm.telefono||'').trim() !== (editTarget.telefono||'').trim()) patch.telefono = (editForm.telefono||'').trim()
    if ((editForm.notas||'').trim() !== (editTarget.notas||'').trim()) patch.notas = (editForm.notas||'').trim()
    // NO incluir estado ya_es_cliente en este primer patch; se hará tras crear el cliente
  if (!convertingToCliente && editForm.estado !== editTarget.estado) patch.estado = editForm.estado as ProspectoEstado
    // Si lo único que cambia es el estado a ya_es_cliente, no enviamos patch ahora (abriremos modal)
    const hasOtherChanges = Object.keys(patch).length > 0
    if(!hasOtherChanges && convertingToCliente){
      // Abrir modal de cliente y salir
      openNuevoClienteFromProspecto(editTarget)
      closeEdit()
      return
    }
  if(!hasOtherChanges && !convertingToCliente){ setToast({ msg:'Sin cambios', type:'success' }); closeEdit(); return }
    try {
      const r = await fetch('/api/prospectos/'+editTarget.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      if (r.ok) {
        await r.json()
        setToast({ msg:'Prospecto actualizado', type:'success' })
  const needConversionAfterPatch = convertingToCliente
        const refProspect = editTarget
        closeEdit(); fetchAll()
        if(needConversionAfterPatch){
          // Abrir modal para crear cliente; estado se actualizará tras éxito
          openNuevoClienteFromProspecto(refProspect)
        }
      } else {
        let errMsg = 'Error al actualizar'
        try { const j = await r.json() as { error?: string }; if(j?.error) errMsg = j.error } catch {}
        setToast({ msg: errMsg, type:'error' })
      }
    } catch { setToast({ msg:'Error al actualizar', type:'error' }) }
  }

  // Eliminación completa de prospectos y manejo de cita deshabilitados según requerimiento.

  const needYear = semana !== 'ALL'
  return (
    <div className="container py-4 position-relative">
      <LoadingOverlay show={loading && !prospectos.length} text="Cargando prospectos..." />
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
        <select value={agenteId} onChange={e=>setAgenteId(e.target.value)} className="form-select w-auto" title="También se usa para asignar el agente al crear un prospecto">
          <option value="">(Todos para ver / Sin asignar al crear)</option>
          {agentes.map(a=> <option key={a.id} value={a.id}>{a.nombre || a.email}</option>)}
        </select>
        <span className="text-muted small">Este selector también asigna el agente al crear un prospecto.</span>
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
    // Tipo para la respuesta de actividad semanal (por usuario)
    type ActivityResponse = {
      success?: boolean
      daily?: { labels?: string[]; counts?: number[] }
      breakdown?: { views?:number; clicks?:number; forms?:number; prospectos?:number; planificacion?:number; clientes?:number; polizas?:number; usuarios?:number; parametros?:number; reportes?:number; otros?:number }
      details?: { prospectos_altas?:number; prospectos_cambios_estado?:number; prospectos_notas?:number; planificacion_ediciones?:number; clientes_altas?:number; clientes_modificaciones?:number; polizas_altas?:number; polizas_modificaciones?:number }
      dailyBreakdown?: Array<{ views?:number; clicks?:number; forms?:number; prospectos?:number; planificacion?:number; clientes?:number; polizas?:number; usuarios?:number; parametros?:number; reportes?:number; otros?:number }>
      detailsDaily?: Array<{ prospectos_altas?:number; prospectos_cambios_estado?:number; prospectos_notas?:number; planificacion_ediciones?:number; clientes_altas?:number; clientes_modificaciones?:number; polizas_altas?:number; polizas_modificaciones?:number }>
    }
    const perAgent: Record<number, ReturnType<typeof computeExtendedMetrics>> = {}
    const grouped = prospectos.reduce<Record<number,Prospecto[]>>((acc,p)=>{ (acc[p.agente_id] ||= []).push(p); return acc },{})
    for(const [agId, list] of Object.entries(grouped)) perAgent[Number(agId)] = computeExtendedMetrics(list,{ diaSemanaActual })
    // Obtener planificación por agente (en paralelo)
  let planningSummaries: Record<number,{ prospeccion:number; smnyl:number; total:number }> | undefined
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
          const counts = { prospeccion:0, smnyl:0 }
          for(const b of (data.bloques||[])){
            if(b.activity==='PROSPECCION') counts.prospeccion++
            else if(b.activity==='SMNYL') counts.smnyl++
            // CITAS dormidas: ignorar
          }
          planningSummaries[id] = { ...counts, total: counts.prospeccion + counts.smnyl }
        }}
      }
    } catch {/* ignore planning errors */}
    // Calcular deltas reales por agente contra semana anterior
  let perAgentDeltas: Record<number,{ totalDelta:number }> | undefined
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
            if(!data){ continue }
            const currentList = grouped[Number(id)] || []
            const currentTotal = currentList.length
            const prevTotal = data.total || 0
            perAgentDeltas[Number(id)] = { totalDelta: currentTotal - prevTotal }
          }
        } catch { /* ignorar errores de delta */ }
      }
    }
      // Actividad semanal por usuario (solo si semana específica)
      let perAgentActivity: Record<number,{ email?:string; labels:string[]; counts:number[]; breakdown?: { views:number; clicks:number; forms:number; prospectos:number; planificacion:number; clientes:number; polizas:number; usuarios:number; parametros:number; reportes:number; otros:number }; details?: { prospectos_altas:number; prospectos_cambios_estado:number; prospectos_notas:number; planificacion_ediciones:number; clientes_altas:number; clientes_modificaciones:number; polizas_altas:number; polizas_modificaciones:number }; detailsDaily?: Array<{ prospectos_altas:number; prospectos_cambios_estado:number; prospectos_notas:number; planificacion_ediciones:number; clientes_altas:number; clientes_modificaciones:number; polizas_altas:number; polizas_modificaciones:number }> }> | undefined
      try {
        if (semana !== 'ALL'){
          const weekNum = semana as number
          const agentIds = Object.keys(grouped)
          const responses = await Promise.all(agentIds.map(async id=>{
            const ag = agentes.find(a=> String(a.id)===String(id))
            const email = ag?.email
            if(!email) return { id:Number(id), data:null as ActivityResponse|null }
            const paramsAct = new URLSearchParams({ anio:String(anio), semana:String(weekNum), usuario: email })
            try {
              const r = await fetch('/api/auditoria/activity?' + paramsAct.toString())
              if(!r.ok) return { id:Number(id), data:null as ActivityResponse|null }
              const j = await r.json() as ActivityResponse
              return { id:Number(id), data:j, email }
            } catch { return { id:Number(id), data:null as ActivityResponse|null } }
          }))
          perAgentActivity = {}
          for(const resp of responses){
            const { id, data, email } = resp as { id:number; data: ActivityResponse | null; email?:string }
            if(data && data.success && data.daily && Array.isArray(data.daily.counts)){
              const b = data.breakdown || {}
              const d = data.details || undefined
              const dd = Array.isArray(data.detailsDaily) ? data.detailsDaily : undefined
              const normalizedDetails = d ? {
                prospectos_altas: Number(d.prospectos_altas||0),
                prospectos_cambios_estado: Number(d.prospectos_cambios_estado||0),
                prospectos_notas: Number(d.prospectos_notas||0),
                planificacion_ediciones: Number(d.planificacion_ediciones||0),
                clientes_altas: Number(d.clientes_altas||0),
                clientes_modificaciones: Number(d.clientes_modificaciones||0),
                polizas_altas: Number(d.polizas_altas||0),
                polizas_modificaciones: Number(d.polizas_modificaciones||0)
              } : undefined
              perAgentActivity[id] = {
                email,
                labels: data.daily.labels || [],
                counts: data.daily.counts || [],
                breakdown: {
                  views: Number(b.views||0),
                  clicks: Number(b.clicks||0),
                  forms: Number(b.forms||0),
                  prospectos: Number(b.prospectos||0),
                  planificacion: Number(b.planificacion||0),
                  clientes: Number(b.clientes||0),
                  polizas: Number(b.polizas||0),
                  usuarios: Number(b.usuarios||0),
                  parametros: Number(b.parametros||0),
                  reportes: Number(b.reportes||0),
                  otros: Number(b.otros||0)
                },
                ...(normalizedDetails ? { details: normalizedDetails } : {}),
                ...(dd ? { detailsDaily: dd.map(d0=>({
                  prospectos_altas: Number(d0.prospectos_altas||0),
                  prospectos_cambios_estado: Number(d0.prospectos_cambios_estado||0),
                  prospectos_notas: Number(d0.prospectos_notas||0),
                  planificacion_ediciones: Number(d0.planificacion_ediciones||0),
                  clientes_altas: Number(d0.clientes_altas||0),
                  clientes_modificaciones: Number(d0.clientes_modificaciones||0),
                  polizas_altas: Number(d0.polizas_altas||0),
                  polizas_modificaciones: Number(d0.polizas_modificaciones||0)
                })) } : {})
              }
            }
          }
          if(Object.keys(perAgentActivity).length === 0) perAgentActivity = undefined
        }
      } catch { /* ignore activity errors */ }
  // Exportación (agrupado) usando semana seleccionada
      const selectedWeekNum = (semana === 'ALL') ? metaWeek : Number(semana)
      const exportPros = prospectos.filter(p=> p.anio===anio && p.semana_iso===selectedWeekNum)
      // NOTA: Aunque no haya prospectos en la semana, seguiremos mostrando todos los agentes en la tabla (filas vacías)
      if(exportPros.length===0){
        // Antes retornábamos; ahora continuamos para que el PDF muestre estructura con agentes sin datos
        console.warn('[export PDF] Semana sin prospectos, se generará PDF con filas vacías por agente.')
      }
  // resumenExport no se usa más
  // Calcular previas (arrastre) por agente: prospectos con semana < seleccionada activos (pendiente/seguimiento/con_cita)
  const perAgentPrevCounts = activosPrevios.reduce<Record<number,number>>((acc,p)=>{ acc[p.agente_id] = (acc[p.agente_id]||0)+1; return acc },{})
  const allAgentIds = agentes.map(a=>a.id);
  const doc = new jsPDF();
  const logoW = 32;
  const logoH = 16;
  // Always use the institutional logo as base64
  const logo = await pngToBase64('/Logolealtiaruedablanca.png');
  await exportProspectosPDF(
    doc,
    exportPros,
    { incluirId:false, agrupadoPorAgente: agrupado, agentesMap: agentes.reduce<Record<number,string>>((acc,a)=>{ acc[a.id]= a.nombre||a.email; return acc },{}), allAgentIds, chartEstados: true, metaProspectos, forceLogoBlanco:true, perAgentExtended: perAgent, prevWeekDelta: agg && prevAgg? computePreviousWeekDelta(agg, prevAgg): undefined, filename, perAgentDeltas, planningSummaries, perAgentActivity, perAgentPrevCounts, semanaActual: { anio, semana_iso: selectedWeekNum } },
    autoTable,
    titulo,
    logo,
    logoW,
    logoH
  );
  } else {
    // Filtrar por agente seleccionado explícitamente para evitar incluir otros
    const filtered = (superuser && agenteId)? prospectos.filter(p=> p.agente_id === Number(agenteId)) : prospectos
    // Export individual agente usando semana seleccionada
  const selectedWeekNumInd = (semana === 'ALL') ? metaWeek : Number(semana)
  const exportPros = filtered.filter(p=> p.anio===anio && p.semana_iso===selectedWeekNumInd)
  if(exportPros.length===0){ window.alert(`No hay prospectos en la semana seleccionada (ISO ${selectedWeekNumInd}).`); return }

  const extended = computeExtendedMetrics(exportPros,{ diaSemanaActual })
    // Actividad semanal del agente (para línea de actividad)
  let activityWeekly: { labels: string[]; counts: number[]; breakdown?: { views:number; clicks:number; forms:number; prospectos:number; planificacion:number; clientes:number; polizas:number; usuarios:number; parametros:number; reportes:number; otros:number }; dailyBreakdown?: Array<{ views:number; clicks:number; forms:number; prospectos:number; planificacion:number; clientes:number; polizas:number; usuarios:number; parametros:number; reportes:number; otros:number }> } | undefined
    try {
      if (semana !== 'ALL'){
  const who = (superuser && agenteId) ? (agentes.find(a=> String(a.id)===agenteId)?.email || '') : (user?.email || '')
        if (who){
          const paramsAct = new URLSearchParams({ anio:String(anio), semana:String(semana), usuario: who })
          const rAct = await fetch('/api/auditoria/activity?' + paramsAct.toString())
          if (rAct.ok){
            const j = await rAct.json()
            if (j && j.success && j.daily && Array.isArray(j.daily.counts)){
              const b = j.breakdown || {}
              activityWeekly = {
                labels: j.daily.labels || [],
                counts: j.daily.counts || [],
                breakdown: {
                  views: Number(b.views||0),
                  clicks: Number(b.clicks||0),
                  forms: Number(b.forms||0),
                  prospectos: Number(b.prospectos||0),
                  planificacion: Number(b.planificacion||0),
                  clientes: Number(b.clientes||0),
                  polizas: Number(b.polizas||0),
                  usuarios: Number(b.usuarios||0),
                  parametros: Number(b.parametros||0),
                  reportes: Number(b.reportes||0),
                  otros: Number(b.otros||0)
                },
                dailyBreakdown: Array.isArray(j.dailyBreakdown) ? j.dailyBreakdown : undefined,
                ...(j.details ? { details: j.details } : {}),
                ...(Array.isArray(j.detailsDaily) ? { detailsDaily: j.detailsDaily } : {})
              }
            }
          }
        }
      }
    } catch { /* ignore activity errors */ }
    // Planificación single agente
  let singleAgentPlanning: { bloques:BloquePlanificacion[]; summary:{ prospeccion:number; smnyl:number; total:number } } | undefined
    try {
      if(agenteId && semana!=='ALL'){
        const params = new URLSearchParams({ agente_id:String(agenteId), semana:String(semana), anio:String(anio) })
        const rPlan = await fetch('/api/planificacion?'+params.toString())
        if(rPlan.ok){
          const data = await rPlan.json()
          const counts = { prospeccion:0, smnyl:0 }
          for(const b of (data.bloques||[])){
            if(b.activity==='PROSPECCION') counts.prospeccion++
            else if(b.activity==='SMNYL') counts.smnyl++
            // CITAS dormidas: ignorar
          }
          singleAgentPlanning = { bloques: data.bloques||[], summary: { ...counts, total: counts.prospeccion + counts.smnyl } }
        }
      }
    } catch {/*ignore*/}
  // Exportar sólo la semana actual filtrada y sin 'ya_es_cliente'
  const doc = new jsPDF();
  const logoW = 32;
  const logoH = 16;
  // Always use the institutional logo as base64
  const logo = await pngToBase64('/Logolealtiaruedablanca.png');
  await exportProspectosPDF(
    doc,
    exportPros,
    { incluirId:false, agrupadoPorAgente: agrupado, agentesMap, chartEstados: true, metaProspectos, forceLogoBlanco:true, extendedMetrics: extended, prevWeekDelta: agg && prevAgg? computePreviousWeekDelta(agg, prevAgg): undefined, filename, singleAgentPlanning, activityWeekly, semanaActual: { anio, semana_iso: metaWeek } },
    autoTable,
    titulo,
    logo,
    logoW,
    logoH
  );
  }
  }}>PDF</button>
    </div>}
  {/* Filtro solo con cita eliminado */}
  {agg && (!superuser || (superuser && agenteId)) && <div className="d-flex flex-column gap-2 small mb-3">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <button type="button" onClick={()=>applyEstadoFiltro('')} className={`badge border-0 ${estadoFiltro===''? 'bg-primary':'bg-secondary'} text-white`} title={semana==='ALL'? 'Total del año filtrado' : 'Total semana'}>Total {displayData.total}</button>
          {(['pendiente','seguimiento','con_cita','ya_es_cliente','descartado'] as ProspectoEstado[] | string[]).map(k=> { const v = Number(displayData.por_estado[k] ?? 0); const active = estadoFiltro===k; return <button type="button" key={k} onClick={()=>applyEstadoFiltro(k as ProspectoEstado)} className={`badge border ${active? 'bg-primary text-white':'bg-light text-dark'}`} style={{cursor:'pointer'}} title={ESTADO_LABEL[k as ProspectoEstado]}>{ESTADO_LABEL[k as ProspectoEstado] || k} {v}</button>})}
          {(()=>{ 
            // Objetivo dinámico: meta parametrizada + pendientes (activosPrevios) de semanas anteriores
            const carry = activosPrevios.length
            const objetivoBase = metaProspectos
            const objetivo = objetivoBase + carry
            const progreso = actuales.length // Sólo conteo de la semana actual; si se desea incluir carry cambiar a (actuales.length + carry)
            const ok = progreso>=objetivo
            return <span className={"badge "+ (ok? 'bg-success':'bg-warning text-dark')} title={`Meta semana actual (${metaWeek}). Base ${objetivoBase} + pendientes previas ${carry} = ${objetivo}. Progreso ${progreso}/${objetivo}.`}>{ok? `Meta ${objetivo} ok` : (`${progreso}/${objetivo}`)}</span> 
          })()}
          {!superuser && (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={async ()=> {
              const agrupado = false;
              const agentesMap = agentes.reduce<Record<number,string>>((acc,a)=>{ acc[a.id]= a.nombre||a.email; return acc },{});
              const semanaLabel = semana==='ALL'? 'Año completo' : (()=>{ const r=semanaDesdeNumero(anio, semana as number); return `Semana ${semana} (${formatearRangoSemana(r)})` })();
              const agName = user?.nombre || user?.email || '';
              const titulo = `Reporte de prospectos Agente: ${agName || 'N/A'} ${semanaLabel}`;
              const hoy=new Date();
              const diaSemanaActual = hoy.getDay()===0?7:hoy.getDay();
              const selectedWeekNumBtn = (semana==='ALL')? metaWeek: Number(semana);
              const base = (superuser && agenteId)? prospectos.filter(p=> p.agente_id === Number(agenteId)) : prospectos;
              const exportPros = base.filter(p=> p.anio===anio && p.semana_iso===selectedWeekNumBtn);
              if(exportPros.length===0){ window.alert(`No hay prospectos en la semana seleccionada (ISO ${selectedWeekNumBtn}).`); return }
              const extended = computeExtendedMetrics(exportPros,{ diaSemanaActual });
              const filename = `Reporte_de_prospectos_Agente_${(agName||'NA').replace(/\s+/g,'_')}_semana_${semana==='ALL'?'ALL':semana}_${semanaLabel.replace(/[^0-9_-]+/g,'')}`;
              let activityWeekly: { labels: string[]; counts: number[]; breakdown?: { views:number; clicks:number; forms:number; prospectos:number; planificacion:number; clientes:number; polizas:number; usuarios:number; parametros:number; reportes:number; otros:number }; dailyBreakdown?: Array<{ views:number; clicks:number; forms:number; prospectos:number; planificacion:number; clientes:number; polizas:number; usuarios:number; parametros:number; reportes:number; otros:number }> } | undefined = undefined;
              try {
                if (semana !== 'ALL') {
                  const who = user?.email || '';
                  if (who) {
                    const paramsAct = new URLSearchParams({ anio:String(anio), semana:String(semana), usuario: who });
                    const rAct = await fetch('/api/auditoria/activity?' + paramsAct.toString());
                    if (rAct.ok) {
                      const j = await rAct.json();
                      if (j && j.success && j.daily && Array.isArray(j.daily.counts)) {
                        const b = j.breakdown || {};
                        activityWeekly = {
                          labels: j.daily.labels || [],
                          counts: j.daily.counts || [],
                          breakdown: {
                            views: Number(b.views||0),
                            clicks: Number(b.clicks||0),
                            forms: Number(b.forms||0),
                            prospectos: Number(b.prospectos||0),
                            planificacion: Number(b.planificacion||0),
                            clientes: Number(b.clientes||0),
                            polizas: Number(b.polizas||0),
                            usuarios: Number(b.usuarios||0),
                            parametros: Number(b.parametros||0),
                            reportes: Number(b.reportes||0),
                            otros: Number(b.otros||0)
                          },
                          dailyBreakdown: Array.isArray(j.dailyBreakdown) ? j.dailyBreakdown : undefined,
                          ...(j.details ? { details: j.details } : {}),
                          ...(Array.isArray(j.detailsDaily) ? { detailsDaily: j.detailsDaily } : {})
                        };
                      }
                    }
                  }
                }
              } catch { /* ignore */ }
              const doc = new jsPDF();
              const logo = '/Logolealtia.png';
              const logoW = 32;
              const logoH = 16;
              await exportProspectosPDF(
                doc,
                exportPros,
                { incluirId:false, agrupadoPorAgente: agrupado, agentesMap, chartEstados:true, metaProspectos, forceLogoBlanco:true, extendedMetrics: extended, prevWeekDelta: agg && prevAgg? computePreviousWeekDelta(agg, prevAgg): undefined, filename, activityWeekly, semanaActual: { anio, semana_iso: selectedWeekNumBtn } },
                autoTable,
                titulo,
                logo,
                logoW,
                logoH
              );
            }}>PDF</button>
          )}
        </div>
        {(!superuser || (superuser && agenteId)) && (()=>{ 
          const carry = activosPrevios.length
          const objetivoBase = metaProspectos
          const objetivo = objetivoBase + carry
          const progreso = actuales.length // Alternativa: actuales.length + carry si se decide contar el arrastre como progreso inicial
          const pct = objetivo>0? Math.min(100,(progreso/objetivo)*100) : 0
          const ok = progreso>=objetivo
          return <div style={{minWidth:320}} className="position-relative">
            <div className="progress" style={{height: '1.4rem'}} role="progressbar" aria-valuenow={progreso} aria-valuemin={0} aria-valuemax={objetivo} title={`Progreso semana actual ${progreso}/${objetivo} (Base ${objetivoBase} + previos ${carry})`}>
              <div className={`progress-bar ${ok? 'bg-success':'bg-warning text-dark'}`} style={{width: pct+'%', transition:'width .4s ease'}} />
              <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center small fw-semibold" style={{pointerEvents:'none', mixBlendMode: ok? 'normal':'multiply'}}>
                {progreso}/{objetivo}
              </div>
            </div>
          </div>
        })()}
    </div>}
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
  <div className="col-sm-2"><select value={form.estado} onChange={e=>setForm(f=>({...f,estado:e.target.value as ProspectoEstado}))} className="form-select">{estadoOptions().filter(o=> o.value!=='ya_es_cliente').map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
      </div>
  <div className="mt-2">
        <button className="btn btn-primary btn-sm" disabled={saving || loading || telefonoInvalido} aria-busy={saving} type="submit">
          {saving ? 'Guardando…' : 'Agregar'}
        </button>
      </div>
      {errorMsg && <div className="text-danger small mt-2">{errorMsg}</div>}
    </form>
    <div className="mt-4 mb-2" style={{maxWidth:320}}>
      <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por nombre" className="form-control form-control-sm" />
    </div>
    <h5 className="mb-2">Prospectos semana actual</h5>
  <div className="table-responsive mb-4 fade-in">
      <table className="table table-sm align-middle">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Notas</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {actuales.filter(p=> (!estadoFiltro || p.estado===estadoFiltro) && (!busqueda.trim() || p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))).map(p=> (
            <tr key={p.id}>
              <td><span className={'d-inline-block px-2 py-1 rounded '+ESTADO_CLASSES[p.estado]}>{p.nombre}</span></td>
              <td>{p.telefono? (()=>{ const digits = p.telefono.replace(/[^0-9]/g,''); if(!digits) return p.telefono; const withCode = digits.length===10? '52'+digits : digits; const waUrl = 'https://wa.me/'+withCode; return <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp">{p.telefono}</a>; })(): ''}</td>
              <td style={{maxWidth:260}} className="text-truncate" title={p.notas||''}>{p.notas||''}</td>
              <td>{ESTADO_LABEL[p.estado]}</td>
              <td className="text-end">
                {p.estado === 'ya_es_cliente' ? <span className="badge bg-success">Convertido</span> : <button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>openEdit(p)}>Editar</button>}
              </td>
            </tr>
          ))}
          {(!loading && actuales.length===0) && <tr><td colSpan={7} className="text-center py-4 text-muted">No hay prospectos de la semana actual (para los filtros).</td></tr>}
        </tbody>
      </table>
      {loading && <div className="p-3">Cargando...</div>}
    </div>
    <div className="d-flex align-items-center gap-2 mb-2">
      <h5 className="m-0">Prospectos semanas anteriores</h5>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={()=>setShowPrevios(s=>!s)}>{showPrevios? 'Ocultar':'Mostrar'}</button>
      <span className="badge bg-light text-dark">{activosPrevios.length}</span>
      {needYear && !yearProspectos && <span className="inline-spinner small text-muted"><span className="spinner-border spinner-border-sm" role="status" /> cargando historial...</span>}
    </div>
    {showPrevios && (
      <div className="table-responsive mb-4 fade-in">
        <table className="table table-sm align-middle">
          <thead>
            <tr>
              <th>Semana</th>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Notas</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {activosPrevios.filter(p=> (!estadoFiltro || p.estado===estadoFiltro) && (!busqueda.trim() || p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))).map(p=> (
              <tr key={p.id}>
                <td>{p.semana_iso}</td>
                <td><span className={'d-inline-block px-2 py-1 rounded '+ESTADO_CLASSES[p.estado]}>{p.nombre}</span></td>
                <td>{p.telefono? (()=>{ const digits = p.telefono.replace(/[^0-9]/g,''); if(!digits) return p.telefono; const withCode = digits.length===10? '52'+digits : digits; const waUrl = 'https://wa.me/'+withCode; return <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp">{p.telefono}</a>; })(): ''}</td>
                <td style={{maxWidth:260}} className="text-truncate" title={p.notas||''}>{p.notas||''}</td>
                <td>{ESTADO_LABEL[p.estado]}</td>
                <td className="text-end">
                  {p.estado === 'ya_es_cliente' ? <span className="badge bg-success">Convertido</span> : <button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>openEdit(p)}>Editar</button>}
                </td>
              </tr>
            ))}
            {(!loading && activosPrevios.length===0) && <tr><td colSpan={7} className="text-center py-4 text-muted">Sin prospectos activos de semanas anteriores.</td></tr>}
          </tbody>
        </table>
      </div>
    )}
    {toast && <Notification message={toast.msg} type={toast.type} onClose={()=>setToast(null)} />}
    {editTarget && (
      <AppModal title={`Editar prospecto`} icon="pencil" onClose={closeEdit}>
        <div className="small">
          <div className="row g-2">
            <div className="col-sm-6">
              <label className="form-label small">Nombre</label>
              <input className="form-control" value={editForm.nombre} onChange={e=>setEditForm(f=>({...f,nombre:e.target.value}))} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small">Teléfono</label>
              <input className="form-control" value={editForm.telefono} onChange={e=>setEditForm(f=>({...f,telefono:e.target.value}))} />
            </div>
            <div className="col-12">
              <label className="form-label small">Notas</label>
              <input className="form-control" value={editForm.notas} onChange={e=>setEditForm(f=>({...f,notas:e.target.value}))} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small">Estado</label>
              <select className="form-select" value={editForm.estado} onChange={e=>setEditForm(f=>({...f,estado:e.target.value as ProspectoEstado}))}>
                {estadoOptions().map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 mt-3">
            <button className="btn btn-outline-secondary btn-sm" onClick={closeEdit}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={!editForm.nombre.trim()}>Guardar cambios</button>
          </div>
        </div>
      </AppModal>
    )}
    {showNuevoCliente && (
      <AppModal title="Registrar cliente" icon="person-plus" onClose={()=>{ if(!savingCliente) setShowNuevoCliente(false) }}>
        <div className="small">
          <p className="mb-2 text-muted">Completa los datos básicos del nuevo cliente generado desde el prospecto convertido.</p>
          <div className="row g-2">
            <div className="col-sm-6">
              <label className="form-label small">Primer nombre *</label>
              <input className="form-control form-control-sm" value={nuevoCliente.primer_nombre} onChange={e=>setNuevoCliente(c=>({...c, primer_nombre:e.target.value}))} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small">Segundo nombre</label>
              <input className="form-control form-control-sm" value={nuevoCliente.segundo_nombre} onChange={e=>setNuevoCliente(c=>({...c, segundo_nombre:e.target.value}))} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small">Primer apellido *</label>
              <input className="form-control form-control-sm" value={nuevoCliente.primer_apellido} onChange={e=>setNuevoCliente(c=>({...c, primer_apellido:e.target.value}))} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small">Segundo apellido *</label>
              <input className="form-control form-control-sm" value={nuevoCliente.segundo_apellido} onChange={e=>setNuevoCliente(c=>({...c, segundo_apellido:e.target.value}))} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small">Teléfono *</label>
              <input className="form-control form-control-sm" value={nuevoCliente.telefono_celular} onChange={e=>setNuevoCliente(c=>({...c, telefono_celular:e.target.value.replace(/[^0-9+\s-]/g,'')}))} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small">Email *</label>
              <input className="form-control form-control-sm" value={nuevoCliente.email} onChange={e=>setNuevoCliente(c=>({...c, email:e.target.value}))} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small">Fecha nacimiento</label>
              <input type="date" className="form-control form-control-sm" value={nuevoCliente.fecha_nacimiento || ''} onChange={e=>setNuevoCliente(c=>({...c, fecha_nacimiento:e.target.value||undefined}))} />
            </div>
          </div>
          {clienteError && <div className="text-danger small mt-2">{clienteError}</div>}
          {clienteSuccess && <div className="text-success small mt-2">{clienteSuccess}</div>}
          <div className="d-flex justify-content-end gap-2 mt-3">
            <button className="btn btn-outline-secondary btn-sm" disabled={savingCliente} onClick={()=>{ if(!savingCliente) setShowNuevoCliente(false) }}>Cancelar</button>
            <button className="btn btn-primary btn-sm" disabled={savingCliente} onClick={submitNuevoCliente}>{savingCliente? 'Guardando…':'Crear cliente'}</button>
          </div>
        </div>
      </AppModal>
    )}
    {conflicto && (
      <AppModal title="Conflicto de bloque" icon="exclamation-triangle" onClose={()=> setConflicto(null)}>
        <div className="small">
          <p className="mb-3">Existe un bloque <strong>{conflicto.bloque?.activity}</strong> en la planificación para <strong>{conflicto.fechaLocal}</strong> a las <strong>{conflicto.horaLocal}:00</strong>. ¿Reemplazarlo por la cita del prospecto <strong>{conflicto.prospecto?.nombre}</strong>?</p>
          <div className="d-flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={async ()=>{
              try {
                // 'planificacion' no existe en Prospecto, así que usamos un array vacío por defecto
                const bloques = [];
                bloques.push({ day:conflicto.day, hour:conflicto.horaLocal, activity:'CITAS', origin:'manual' });
                const body = { agente_id: conflicto.prospecto?.agente_id, semana_iso: conflicto.semana, anio: conflicto.anio, bloques };
                await fetch('/api/planificacion',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
                setConflicto(null);
                window.dispatchEvent(new CustomEvent('prospectos:cita-updated'));
                setToast({msg:'Bloque reemplazado por cita', type:'success'});
              } catch {
                setToast({msg:'Error al reemplazar bloque', type:'error'});
                setConflicto(null);
              }
            }}>Reemplazar bloque</button>
            <button className="btn btn-outline-secondary btn-sm" onClick={()=> setConflicto(null)}>Mantener</button>
          </div>
        </div>
      </AppModal>
    )}
  </div>
  );
}
