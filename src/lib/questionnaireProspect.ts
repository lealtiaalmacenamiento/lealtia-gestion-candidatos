import type { SupabaseClient } from '@supabase/supabase-js'
import { obtenerSemanaIso } from '@/lib/semanaIso'
import { extractSemanticAnswers, type QuestionnaireSection } from '@/lib/validation/questionnaireSchemas'
import type { PprResult } from '@/lib/pprCalculator'

const PPR_NOTE_START = '--- Simulación PPR ---'
const PPR_NOTE_END = '--- Fin simulación PPR ---'
const QUESTIONNAIRE_NOTE_START = '--- Cuestionario público ---'
const QUESTIONNAIRE_NOTE_END = '--- Fin cuestionario público ---'

export interface QuestionnaireProspectContact {
  nombre: string
  email: string
  telefono: string
  edad: number
}

export interface EnsureQuestionnaireProspectInput {
  agenteId: number
  questionnaireTitle: string
  agentCode: string
  sections: QuestionnaireSection[]
  answers: Record<string, unknown>
  requierePpr?: boolean
  pprResult?: PprResult | null
  existingProspectId?: number | null
}

function money(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2
  }).format(value)
}

function numberMx(value: number) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(value)
}

function noteDate() {
  return new Date().toLocaleString('es-MX', {
    timeZone: process.env.AGENDA_TZ || 'America/Mexico_City',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function buildQuestionnaireNote(questionnaireTitle: string, agentCode: string) {
  return [
    QUESTIONNAIRE_NOTE_START,
    `Fecha de captura: ${noteDate()}`,
    `Cuestionario: ${questionnaireTitle}`,
    `Código de agente: ${agentCode}`,
    QUESTIONNAIRE_NOTE_END
  ].join('\n')
}

function upsertQuestionnaireNote(
  currentNotes: string | null | undefined,
  questionnaireTitle: string,
  agentCode: string
) {
  const base = String(currentNotes || '')
    .replace(/\n?\s*--- Cuestionario público ---[\s\S]*?--- Fin cuestionario público ---\s*/g, '\n')
    .trim()
  return [base, buildQuestionnaireNote(questionnaireTitle, agentCode)].filter(Boolean).join('\n\n')
}

function buildPprProspectNote(ppr: PprResult) {
  return [
    PPR_NOTE_START,
    `Fecha de simulación: ${noteDate()}`,
    `Plan seleccionado: ${ppr.planNombre}`,
    `Edad usada para cálculo: ${ppr.edad} años`,
    `Años de pago: ${ppr.aniosPago}`,
    `Aportación anual estimada: ${money(ppr.primaAnualMXN)}`,
    `Aportación mensual estimada: ${money(ppr.primaMensualMXN)}`,
    `Prima anual en UDI: ${numberMx(ppr.primaAnualUDI)} UDIs`,
    `Total aportado estimado: ${money(ppr.totalAportadoMXN)}`,
    `Meta estimada a los 65: ${money(ppr.meta65MXN)}`,
    `Deducción ISR estimada: ${money(ppr.deduccionISR_MXN)}`,
    `Ahorro más beneficio fiscal: ${money(ppr.totalAhorroMXN)}`,
    PPR_NOTE_END
  ].join('\n')
}

export function upsertPprNote(currentNotes: string | null | undefined, ppr: PprResult) {
  const base = String(currentNotes || '')
    .replace(/\n?\s*--- Simulación PPR ---[\s\S]*?--- Fin simulación PPR ---\s*/g, '\n')
    .trim()
  return [base, buildPprProspectNote(ppr)].filter(Boolean).join('\n\n')
}

function buildNotes(
  currentNotes: string | null | undefined,
  input: Pick<EnsureQuestionnaireProspectInput, 'questionnaireTitle' | 'agentCode' | 'pprResult'>
) {
  const withQuestionnaire = upsertQuestionnaireNote(currentNotes, input.questionnaireTitle, input.agentCode)
  return input.pprResult ? upsertPprNote(withQuestionnaire, input.pprResult) : withQuestionnaire
}

function contactFromAnswers(
  sections: QuestionnaireSection[],
  answers: Record<string, unknown>,
  requierePpr?: boolean
): QuestionnaireProspectContact {
  const semantic = extractSemanticAnswers(sections, answers)
  const nombre = String(semantic.nombre || '').trim()
  const email = String(semantic.email || '').trim().toLowerCase()
  const telefono = String(semantic.telefono || '').replace(/\D/g, '')
  const edad = Number(semantic.edad)

  if (!nombre || !email || !telefono) {
    throw new Error('El cuestionario debe recopilar nombre, correo y teléfono para registrar al prospecto')
  }
  if (requierePpr && (!Number.isFinite(edad) || edad < 18 || edad > 50)) {
    throw new Error('La edad para la simulación PPR debe estar entre 18 y 50 años')
  }

  return { nombre, email, telefono, edad }
}

export async function ensureQuestionnaireProspect(
  supabase: SupabaseClient,
  input: EnsureQuestionnaireProspectInput
) {
  const contact = contactFromAnswers(input.sections, input.answers, input.requierePpr)
  const now = new Date()
  const week = obtenerSemanaIso(now)

  let existingProspect: {
    id: number
    notas: string | null
    estado?: string | null
    cita_creada?: boolean | null
    fecha_cita?: string | null
  } | null = null
  if (input.existingProspectId) {
    const { data, error } = await supabase
      .from('prospectos')
      .select('id,notas,estado,cita_creada,fecha_cita')
      .eq('id', input.existingProspectId)
      .maybeSingle()
    if (error) throw error
    if (data?.id) {
      existingProspect = {
        id: Number(data.id),
        notas: data.notas as string | null,
        estado: data.estado as string | null,
        cita_creada: data.cita_creada as boolean | null,
        fecha_cita: data.fecha_cita as string | null
      }
    }
  }

  if (!existingProspect) {
    const { data, error } = await supabase
      .from('prospectos')
      .select('id,notas,estado,cita_creada,fecha_cita')
      .ilike('email', contact.email)
      .eq('agente_id', input.agenteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (data?.id) {
      existingProspect = {
        id: Number(data.id),
        notas: data.notas as string | null,
        estado: data.estado as string | null,
        cita_creada: data.cita_creada as boolean | null,
        fecha_cita: data.fecha_cita as string | null
      }
    }
  }

  const notes = buildNotes(existingProspect?.notas, input)

  if (existingProspect?.id) {
    const updatePayload: Record<string, unknown> = {
      agente_id: input.agenteId,
      nombre: contact.nombre,
      email: contact.email,
      telefono: contact.telefono,
      origen: 'cuestionario_ppr',
      notas: notes,
      updated_at: now.toISOString()
    }

    if (existingProspect.estado === 'con_cita') {
      const { data: confirmedCita, error: citaError } = await supabase
        .from('citas')
        .select('inicio')
        .eq('prospecto_id', existingProspect.id)
        .eq('estado', 'confirmada')
        .order('inicio', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (citaError) throw citaError

      if (confirmedCita?.inicio) {
        updatePayload.estado = 'con_cita'
        updatePayload.cita_creada = true
        updatePayload.fecha_cita = confirmedCita.inicio
      } else {
        updatePayload.estado = 'pendiente'
        updatePayload.cita_creada = false
        updatePayload.fecha_cita = null
      }
    }

    const { error } = await supabase
      .from('prospectos')
      .update(updatePayload)
      .eq('id', existingProspect.id)
    if (error) throw error
    return { prospectId: existingProspect.id, contact, created: false }
  }

  const { data: created, error } = await supabase
    .from('prospectos')
    .insert({
      agente_id: input.agenteId,
      anio: week.anio,
      semana_iso: week.semana,
      nombre: contact.nombre,
      email: contact.email,
      telefono: contact.telefono,
      estado: 'pendiente',
      origen: 'cuestionario_ppr',
      first_visit_at: now.toISOString(),
      notas: notes
    })
    .select('id')
    .single()
  if (error) throw error

  return { prospectId: Number(created.id), contact, created: true }
}
