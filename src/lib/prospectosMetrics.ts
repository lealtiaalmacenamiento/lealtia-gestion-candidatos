import type { Prospecto } from '@/types'

export interface ExtendedMetrics {
  conversionPendienteSeguimiento: number
  conversionSeguimientoCita: number
  ratioDescartado: number
  promedioDiasPrimeraCita: number | null
  citasPorHora: Record<string, number>
  riesgoSeguimientoSinCita: Array<{ id:number; nombre:string; dias:number }>
  forecastSemanaTotal?: number | null
}

export interface PreviousWeekDelta { totalDelta:number; conCitaDelta:number; seguimientoDelta:number; pendienteDelta:number }

interface ComputeOptions { hoy?: Date; riesgoDias?: number; diaSemanaActual?: number }

export function computeExtendedMetrics(list: Prospecto[], opts: ComputeOptions = {}): ExtendedMetrics {
  const hoy = opts.hoy || new Date()
  const riesgoDias = opts.riesgoDias ?? 5
  let pendientes=0, seguimientos=0, conCita=0, descartados=0
  const diffs: number[] = []
  const citasPorHora: Record<string, number> = {}
  const riesgo: Array<{id:number; nombre:string; dias:number}> = []
  for(const p of list){
    if(p.estado==='pendiente') pendientes++
    else if(p.estado==='seguimiento') seguimientos++
    else if(p.estado==='con_cita') conCita++
    else if(p.estado==='descartado') descartados++
    if(p.fecha_cita){
      if(p.created_at){
        const d1 = new Date(p.created_at).getTime()
        const d2 = new Date(p.fecha_cita).getTime()
        if(d2 > d1) diffs.push((d2-d1)/86400000)
      }
      const dt = new Date(p.fecha_cita)
      let h = dt.getUTCHours() - 6; if(h<0) h+=24
      const hh = String(h).padStart(2,'0')
      citasPorHora[hh] = (citasPorHora[hh]||0)+1
    } else if(p.estado==='seguimiento' && p.created_at){
      const diffDias = (hoy.getTime() - new Date(p.created_at).getTime())/86400000
      if(diffDias >= riesgoDias) riesgo.push({ id:p.id, nombre:p.nombre, dias: Math.floor(diffDias) })
    }
  }
  const conversionPendienteSeguimiento = (pendientes+seguimientos)? seguimientos/(pendientes+seguimientos): 0
  const conversionSeguimientoCita = (seguimientos+conCita)? conCita/(seguimientos+conCita): 0
  const ratioDescartado = (pendientes+seguimientos+conCita+descartados)? descartados/(pendientes+seguimientos+conCita+descartados): 0
  const promedioDiasPrimeraCita = diffs.length? diffs.reduce((a,b)=>a+b,0)/diffs.length : null
  let forecastSemanaTotal: number | null = null
  if(opts.diaSemanaActual && opts.diaSemanaActual > 0){
    const total = list.length
    forecastSemanaTotal = Math.round((total / opts.diaSemanaActual) * 7)
  }
  return { conversionPendienteSeguimiento, conversionSeguimientoCita, ratioDescartado, promedioDiasPrimeraCita, citasPorHora, riesgoSeguimientoSinCita: riesgo.sort((a,b)=> b.dias - a.dias).slice(0,10), forecastSemanaTotal }
}

export function computePreviousWeekDelta(current:{ total:number; por_estado: Record<string,number>}, prev?: { total:number; por_estado: Record<string,number>}): PreviousWeekDelta | undefined {
  if(!prev) return undefined
  const d = (a:number,b:number)=> a - b
  return {
    totalDelta: d(current.total, prev.total),
    conCitaDelta: d(current.por_estado.con_cita||0, prev.por_estado.con_cita||0),
    seguimientoDelta: d(current.por_estado.seguimiento||0, prev.por_estado.seguimiento||0),
    pendienteDelta: d(current.por_estado.pendiente||0, prev.por_estado.pendiente||0)
  }
}
