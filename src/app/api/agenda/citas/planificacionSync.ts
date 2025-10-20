import type { SupabaseClient } from '@supabase/supabase-js'
import { obtenerSemanaIso, semanaDesdeNumero } from '@/lib/semanaIso'
import type { BloquePlanificacion, ProspectoEstado } from '@/types'

function dayAndHourFromIso(iso: string): { day: number; hour: string; anio: number; semana: number } | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const { anio, semana } = obtenerSemanaIso(date)
  const semanaInfo = semanaDesdeNumero(anio, semana)
  const diffMs = date.getTime() - semanaInfo.inicio.getTime()
  const day = Math.max(0, Math.min(6, Math.floor(diffMs / 86400000)))
  const hour = date.getUTCHours().toString().padStart(2, '0')
  return { day, hour, anio, semana }
}

export async function syncPlanificacionCita(options: {
  supabase: SupabaseClient
  agenteId: number
  inicioIso: string
  prospectoId: number | null
  prospectoNombre: string | null
  citaId: number
  notas?: string | null
}) {
  const { supabase, agenteId, inicioIso, prospectoId, prospectoNombre, citaId, notas } = options
  const meta = dayAndHourFromIso(inicioIso)
  if (!meta) return
  const { anio, semana, day, hour } = meta

  const { data: plan, error: planError } = await supabase
    .from('planificaciones')
    .select('id,bloques,prima_anual_promedio,porcentaje_comision')
    .eq('agente_id', agenteId)
    .eq('semana_iso', semana)
    .eq('anio', anio)
    .maybeSingle()

  if (planError) return

  const blockNota = notas && notas.trim().length ? notas.trim() : null
  const estado: ProspectoEstado = 'con_cita'

  const buildBlock = (): BloquePlanificacion => ({
    day,
    hour,
    activity: 'CITAS',
    origin: 'auto',
    prospecto_id: prospectoId ?? undefined,
    prospecto_nombre: prospectoNombre ?? undefined,
    prospecto_estado: estado,
    notas: blockNota ?? undefined,
    confirmada: true,
    agenda_cita_id: citaId
  })

  if (!plan) {
    await supabase.from('planificaciones').insert({
      agente_id: agenteId,
      semana_iso: semana,
      anio,
      bloques: [buildBlock()],
      prima_anual_promedio: 0,
      porcentaje_comision: 0,
      updated_at: new Date().toISOString()
    })
    return
  }

  const bloques = Array.isArray(plan.bloques) ? (plan.bloques as BloquePlanificacion[]) : []
  let updated = false
  const nextBlocks = bloques.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw
    if (raw.day === day && raw.hour === hour && raw.activity === 'CITAS') {
      updated = true
      return {
        ...raw,
        origin: raw.origin ?? 'manual',
        prospecto_id: prospectoId ?? raw.prospecto_id,
        prospecto_nombre: prospectoNombre ?? raw.prospecto_nombre,
        prospecto_estado: estado,
        notas: blockNota ?? raw.notas,
        confirmada: true,
        agenda_cita_id: citaId
      }
    }
    return raw
  })

  if (!updated) {
    nextBlocks.push(buildBlock())
  }

  await supabase
    .from('planificaciones')
    .update({ bloques: nextBlocks, updated_at: new Date().toISOString() })
    .eq('id', plan.id)
}

export async function detachPlanificacionCita(options: {
  supabase: SupabaseClient
  agenteId: number
  inicioIso: string
  citaId: number
}) {
  const { supabase, agenteId, inicioIso, citaId } = options
  const meta = dayAndHourFromIso(inicioIso)
  if (!meta) return
  const { anio, semana } = meta

  const { data: plan, error } = await supabase
    .from('planificaciones')
    .select('id,bloques')
    .eq('agente_id', agenteId)
    .eq('semana_iso', semana)
    .eq('anio', anio)
    .maybeSingle()

  if (error || !plan) return

  const bloques = Array.isArray(plan.bloques) ? (plan.bloques as BloquePlanificacion[]) : []
  let changed = false
  const nextBlocks = bloques.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw
    if (raw.agenda_cita_id === citaId) {
      changed = true
      const clone: BloquePlanificacion = {
        ...raw,
        confirmada: false,
        agenda_cita_id: null,
        prospecto_estado: raw.prospecto_estado && raw.prospecto_estado !== 'con_cita' ? raw.prospecto_estado : 'seguimiento',
        prospecto_id: raw.prospecto_id,
        prospecto_nombre: raw.prospecto_nombre
      }
      return clone
    }
    return raw
  })

  if (!changed) return

  await supabase
    .from('planificaciones')
    .update({ bloques: nextBlocks, updated_at: new Date().toISOString() })
    .eq('id', plan.id)
}
