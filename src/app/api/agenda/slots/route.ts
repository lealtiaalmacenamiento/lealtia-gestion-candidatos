import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { fetchGoogleCalendarBusy } from '@/lib/agendaProviders'
import { obtenerSemanaIso, semanaDesdeNumero } from '@/lib/semanaIso'
import type { AgendaPlanificacionSummary, AgendaPlanBlock, AgendaBusySourceDetail } from '@/types'

function canConsultSlots(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (!usuario) return false
  if (usuario.rol === 'admin' || usuario.rol === 'superusuario') return true
  if (usuario.rol === 'agente') return true
  return Boolean(usuario.is_desarrollador)
}

type NormalizedProvider = 'google_meet' | 'zoom' | 'teams' | 'google' | null | undefined

function normalizeProvider(value?: string | null): NormalizedProvider {
  if (!value) return null
  if (value === 'google_meet' || value === 'zoom' || value === 'teams' || value === 'google') {
    return value
  }
  return null
}

type BusySlot = {
  usuarioId: number
  usuarioAuthId: string
  inicio: string
  fin: string
  source: 'calendar' | 'agenda' | 'planificacion'
  provider?: NormalizedProvider | null
  title?: string | null
  descripcion?: string | null
  prospectoId?: number | null
  citaId?: number | null
  planId?: number | null
  sourceDetails?: AgendaBusySourceDetail[]
}

const CDMX_TIME_ZONE = 'America/Mexico_City' as const

type TimeZoneParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function getTimeZoneOffset(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })

  const parts = dtf.formatToParts(date)
  const filled: Partial<TimeZoneParts> = {}

  for (const part of parts) {
    if (part.type === 'literal') continue
    if (part.type === 'year' || part.type === 'day' || part.type === 'hour' || part.type === 'minute' || part.type === 'second') {
      filled[part.type] = Number(part.value)
    } else if (part.type === 'month') {
      filled.month = Number(part.value)
    }
  }

  const year = filled.year ?? date.getUTCFullYear()
  const month = (filled.month ?? (date.getUTCMonth() + 1)) - 1
  const day = filled.day ?? date.getUTCDate()
  let hour = filled.hour ?? date.getUTCHours()
  const minute = filled.minute ?? date.getUTCMinutes()
  const second = filled.second ?? date.getUTCSeconds()

  if (hour === 24) {
    hour = 0
    const temp = new Date(Date.UTC(year, month, day, hour, minute, second))
    temp.setUTCDate(temp.getUTCDate() + 1)
    return temp.getTime() - date.getTime()
  }

  return Date.UTC(year, month, day, hour, minute, second) - date.getTime()
}

function zonedLocalToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const utcBase = new Date(Date.UTC(year, monthIndex, day, hour, minute, second))
  const offset = getTimeZoneOffset(utcBase, timeZone)
  return new Date(utcBase.getTime() - offset)
}

function humanizeProvider(provider?: string | null): string | null {
  if (!provider) return null
  switch (provider) {
    case 'google_meet':
      return 'Google Meet'
    case 'zoom':
      return 'Zoom'
    case 'teams':
      return 'Microsoft Teams'
    case 'google':
      return 'Google Calendar'
    default:
      return provider
  }
}

type SlotsResponse = {
  range: { desde?: string | null; hasta?: string | null }
  busy: BusySlot[]
  missingAuth: number[]
  planificaciones?: AgendaPlanificacionSummary[]
  warnings?: string[]
}

function slotKey(usuarioId: number, inicio: string, fin: string): string {
  const start = new Date(inicio)
  const end = new Date(fin)
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const startMinute = Math.round(start.getTime() / 60000)
    const endMinute = Math.round(end.getTime() / 60000)
    return `${usuarioId}|${startMinute}|${endMinute}`
  }
  return `${usuarioId}|${inicio}|${fin}`
}

function combineBusySlots(slots: BusySlot[]): BusySlot[] {
  if (slots.length === 0) return []
  const grouped = new Map<string, BusySlot>()

  for (const slot of slots) {
    const key = slotKey(slot.usuarioId, slot.inicio, slot.fin)
    const detail: AgendaBusySourceDetail = {
      source: slot.source,
      title: slot.title ?? null,
      descripcion: slot.descripcion ?? null,
      provider: normalizeProvider(slot.provider) ?? null,
      prospectoId: slot.prospectoId ?? null,
      citaId: slot.citaId ?? null,
      planId: slot.planId ?? null
    }

    const existing = grouped.get(key)
    if (existing) {
      const details = existing.sourceDetails ?? []
      existing.sourceDetails = [...details, detail]
      if (existing.prospectoId == null && slot.prospectoId != null) {
        existing.prospectoId = slot.prospectoId
      }
      if (existing.citaId == null && slot.citaId != null) {
        existing.citaId = slot.citaId
      }
      if (existing.planId == null && slot.planId != null) {
        existing.planId = slot.planId
      }
      if (existing.provider == null && slot.provider) {
        existing.provider = normalizeProvider(slot.provider)
      }
      continue
    }

    grouped.set(key, {
      ...slot,
      sourceDetails: [detail]
    })
  }

  const combined = Array.from(grouped.values()).map((slot) => {
    const details = slot.sourceDetails ?? []
    const preferredSource = details.find((entry) => entry.source === 'agenda')?.source
      ?? details.find((entry) => entry.source === 'planificacion')?.source
      ?? details.find((entry) => entry.source === 'calendar')?.source
      ?? slot.source

    const provider = normalizeProvider(slot.provider)
      ?? normalizeProvider(details.find((entry) => entry.provider)?.provider)
      ?? null

    const prospectoId = slot.prospectoId
      ?? details.find((entry) => entry.prospectoId != null)?.prospectoId
      ?? null

    const citaId = slot.citaId
      ?? details.find((entry) => entry.citaId != null)?.citaId
      ?? null

    const planId = slot.planId
      ?? details.find((entry) => entry.planId != null)?.planId
      ?? null

    const descripcionParts = Array.from(
      new Set(
        details
          .map((entry) => (entry.descripcion || '').trim())
          .filter((value): value is string => value.length > 0)
      )
    )

    return {
      ...slot,
      source: preferredSource,
      provider,
      prospectoId,
      citaId,
      planId,
      title: null,
      descripcion: descripcionParts.length ? descripcionParts.join(' · ') : null
    }
  })

  combined.sort((a, b) => {
    const diff = new Date(a.inicio).getTime() - new Date(b.inicio).getTime()
    if (diff !== 0) return diff
    return a.usuarioId - b.usuarioId
  })

  return combined
}

export async function GET(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!canConsultSlots(actor)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const url = new URL(req.url)
  const usuariosParam = url.searchParams.get('usuarios')
  if (!usuariosParam) {
    return NextResponse.json({ error: 'Parámetro usuarios requerido (ids separados por coma)' }, { status: 400 })
  }

  const usuarioIds = usuariosParam
    .split(',')
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n))

  if (usuarioIds.length === 0) {
    return NextResponse.json({ error: 'Debe incluir al menos un usuario válido' }, { status: 400 })
  }

  const desdeParam = url.searchParams.get('desde')
  const hastaParam = url.searchParams.get('hasta')

  const desdeDate = desdeParam ? new Date(desdeParam) : null
  const hastaDate = hastaParam ? new Date(hastaParam) : null

  if (desdeParam && (!desdeDate || Number.isNaN(desdeDate.getTime()))) {
    return NextResponse.json({ error: 'Fecha desde inválida' }, { status: 400 })
  }
  if (hastaParam && (!hastaDate || Number.isNaN(hastaDate.getTime()))) {
    return NextResponse.json({ error: 'Fecha hasta inválida' }, { status: 400 })
  }

  const desdeIso = desdeDate ? desdeDate.toISOString() : null
  const hastaIso = hastaDate ? hastaDate.toISOString() : null

  const supabase = ensureAdminClient()
  const warnings: string[] = []
  const { data: usuarios, error: usuariosError } = await supabase
    .from('usuarios')
    .select('id,id_auth')
    .in('id', usuarioIds)

  if (usuariosError) {
    return NextResponse.json({ error: usuariosError.message }, { status: 500 })
  }

  const usuarioIdByAuthId = new Map<string, number>()
  const authIdByUsuarioId = new Map<number, string>()
  const missingAuth: number[] = []

  for (const usuario of usuarios || []) {
    if (!usuario.id_auth) {
      missingAuth.push(usuario.id)
      continue
    }
    usuarioIdByAuthId.set(usuario.id_auth, usuario.id)
    authIdByUsuarioId.set(usuario.id, usuario.id_auth)
  }

  const authIds = [...usuarioIdByAuthId.keys()]
  if (authIds.length === 0) {
    const response: SlotsResponse = {
      range: { desde: desdeIso, hasta: hastaIso },
      busy: [],
      missingAuth,
      warnings: warnings.length ? warnings : undefined
    }
    return NextResponse.json(response)
  }

  let query = supabase
    .from('citas_ocupadas')
    .select('usuario_id,inicio,fin')
    .in('usuario_id', authIds)
    .order('inicio', { ascending: true })

  if (desdeIso) {
    query = query.gte('fin', desdeIso)
  }
  if (hastaIso) {
    query = query.lte('inicio', hastaIso)
  }

  const { data: ocupadas, error: ocupadasError } = await query
  if (ocupadasError) {
    return NextResponse.json({ error: ocupadasError.message }, { status: 500 })
  }

  const busy: BusySlot[] = []
  for (const row of ocupadas || []) {
    if (!row?.usuario_id) continue
    const usuarioId = usuarioIdByAuthId.get(row.usuario_id)
    if (!usuarioId) continue
    busy.push({
      usuarioId,
      usuarioAuthId: row.usuario_id,
      inicio: row.inicio,
      fin: row.fin,
      source: 'calendar',
      title: 'Evento externo',
      descripcion: null,
      provider: null
    })
  }

  const authIdList = [...usuarioIdByAuthId.keys()]

  if (authIdList.length > 0) {
    const rangeStartIso = desdeIso
    const rangeEndIso = hastaIso

    const overlapFilter = (inicio: string, fin: string) => {
      const start = new Date(inicio)
      const end = new Date(fin)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true
      if (rangeStartIso) {
        const refStart = new Date(rangeStartIso)
        if (end <= refStart) return false
      }
      if (rangeEndIso) {
        const refEnd = new Date(rangeEndIso)
        if (start >= refEnd) return false
      }
      return true
    }

  const citasBusyMap = new Map<number, { inicio: string; fin: string; meeting_provider: string | null; prospecto_id: number | null; authTargets: string[] }>()

    const fetchCitas = async (column: 'agente_id' | 'supervisor_id') => {
      const { data, error } = await supabase
        .from('citas')
        .select('id,inicio,fin,meeting_provider,prospecto_id,agente_id,supervisor_id')
        .eq('estado', 'confirmada')
        .in(column, authIdList)
        .order('inicio', { ascending: true })
      if (error) throw error
      for (const row of data || []) {
        if (!row?.id || !row.inicio || !row.fin) continue
        if (!overlapFilter(row.inicio, row.fin)) continue
        const existing = citasBusyMap.get(row.id) || {
          inicio: row.inicio,
          fin: row.fin,
          meeting_provider: row.meeting_provider || null,
          prospecto_id: row.prospecto_id ?? null,
          authTargets: [] as string[]
        }
        const authValue = column === 'agente_id' ? row.agente_id : row.supervisor_id
        if (authValue && !existing.authTargets.includes(authValue)) {
          existing.authTargets.push(authValue)
        }
        existing.inicio = row.inicio
        existing.fin = row.fin
        existing.meeting_provider = row.meeting_provider || existing.meeting_provider || null
        existing.prospecto_id = (row.prospecto_id ?? existing.prospecto_id) ?? null
        citasBusyMap.set(row.id, existing)
      }
    }

    try {
      await Promise.all([fetchCitas('agente_id'), fetchCitas('supervisor_id')])
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Error consultando citas' }, { status: 500 })
    }

    for (const [citaId, info] of citasBusyMap.entries()) {
      for (const authId of info.authTargets) {
        const usuarioId = usuarioIdByAuthId.get(authId)
        if (!usuarioId) continue
        busy.push({
          usuarioId,
          usuarioAuthId: authId,
          inicio: info.inicio,
          fin: info.fin,
          source: 'agenda',
          provider: normalizeProvider(info.meeting_provider) ?? null,
          title: 'Cita confirmada',
          descripcion: null,
          prospectoId: info.prospecto_id ?? null,
          citaId
        })
      }
    }

  const agendaKey = (slot: BusySlot) => `${slot.usuarioAuthId}|${slot.inicio}|${slot.fin}`
    const agendaSlotsByKey = new Map<string, BusySlot>()
    for (const slot of busy) {
      if (slot.source === 'agenda') {
        agendaSlotsByKey.set(agendaKey(slot), slot)
      }
    }
    for (const slot of busy) {
      if (slot.source !== 'calendar') continue
      const linked = agendaSlotsByKey.get(agendaKey(slot))
      if (!linked) continue
      slot.citaId = linked.citaId ?? slot.citaId ?? null
      slot.prospectoId = linked.prospectoId ?? slot.prospectoId ?? null
  slot.provider = linked.provider ?? slot.provider ?? null
      slot.title = linked.citaId ? 'Calendario conectado (sincronizado)' : slot.title
      const detalles: string[] = []
      if (linked.citaId) {
        detalles.push(`Cita #${linked.citaId}`)
      }
      const providerLabel = humanizeProvider(linked.provider)
      if (providerLabel) {
        detalles.push(`Plataforma: ${providerLabel}`)
      }
      if (detalles.length > 0) {
        slot.descripcion = detalles.join(' · ')
      }
    }

    const calendarRangeStart = rangeStartIso ?? new Date().toISOString()
    const calendarRangeEnd = (() => {
      if (rangeEndIso) return rangeEndIso
      const fallbackEnd = new Date(calendarRangeStart)
      fallbackEnd.setUTCDate(fallbackEnd.getUTCDate() + 7)
      return fallbackEnd.toISOString()
    })()

    if (calendarRangeStart && calendarRangeEnd) {
      const googleBusyResults = await Promise.all(
        authIdList.map(async (authId) => {
          const usuarioId = usuarioIdByAuthId.get(authId)
          if (!usuarioId) return [] as BusySlot[]
          try {
            const entries = await fetchGoogleCalendarBusy(authId, calendarRangeStart, calendarRangeEnd)
            return entries.map<BusySlot>((entry) => ({
              usuarioId,
              usuarioAuthId: authId,
              inicio: entry.start,
              fin: entry.end,
              source: 'calendar',
              provider: 'google',
              title: 'Evento externo (Google Calendar)',
              descripcion: 'Reservado fuera del CRM',
              prospectoId: null,
              citaId: null,
              planId: null
            }))
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Error consultando Google Calendar'
            warnings.push(`No se pudo consultar Google Calendar para el usuario ${usuarioId}: ${message}`)
            return [] as BusySlot[]
          }
        })
      )

      for (const entries of googleBusyResults) {
        busy.push(...entries)
      }
    }

    // Planificación semanal (bloques CITAS)
    const weeksSet = new Map<string, { anio: number; semana: number }>()
    if (desdeDate || hastaDate) {
      const start = new Date(desdeDate || hastaDate || Date.now())
      const end = new Date(hastaDate || desdeDate || Date.now())
      if (start > end) {
        const temp = new Date(start)
        start.setTime(end.getTime())
        end.setTime(temp.getTime())
      }
      const cursor = new Date(start)
      while (cursor <= end) {
        const { anio, semana } = obtenerSemanaIso(cursor)
        const key = `${anio}-${semana}`
        if (!weeksSet.has(key)) {
          weeksSet.set(key, { anio, semana })
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
    } else {
      const today = obtenerSemanaIso(new Date())
      weeksSet.set(`${today.anio}-${today.semana}`, { anio: today.anio, semana: today.semana })
    }

    let planificaciones: AgendaPlanificacionSummary[] = []
    if (weeksSet.size > 0) {
      const conditions = Array.from(weeksSet.values())
      let planQuery = supabase
        .from('planificaciones')
        .select('id,agente_id,anio,semana_iso,bloques')
        .in('agente_id', usuarioIds)
      const orFilter = conditions
        .map((item) => `and(anio.eq.${item.anio},semana_iso.eq.${item.semana})`)
        .join(',')
      if (orFilter) {
        planQuery = planQuery.or(orFilter)
      }
      const { data: planes, error: planError } = await planQuery
      if (planError) {
        return NextResponse.json({ error: planError.message }, { status: 500 })
      }
      planificaciones = (planes || []).map((plan) => {
        const blocksRaw = Array.isArray(plan?.bloques) ? (plan.bloques as unknown[]) : []
        const { inicio } = semanaDesdeNumero(plan.anio, plan.semana_iso)
        const enriched: AgendaPlanBlock[] = []
        for (const raw of blocksRaw) {
          if (!raw || typeof raw !== 'object') continue
          const block = raw as AgendaPlanBlock
          if (typeof block.day !== 'number' || typeof block.hour !== 'string') continue
          const baseDate = new Date(inicio)
          baseDate.setUTCDate(baseDate.getUTCDate() + block.day)
          const hourInt = Number.parseInt(block.hour, 10)
          let startUtc = new Date(baseDate)
          let endUtc = new Date(baseDate)

          if (Number.isFinite(hourInt)) {
            const year = baseDate.getUTCFullYear()
            const monthIndex = baseDate.getUTCMonth()
            const dayOfMonth = baseDate.getUTCDate()
            startUtc = zonedLocalToUtc(year, monthIndex, dayOfMonth, hourInt, 0, 0, CDMX_TIME_ZONE)
            endUtc = zonedLocalToUtc(year, monthIndex, dayOfMonth, hourInt + 1, 0, 0, CDMX_TIME_ZONE)
          } else {
            endUtc.setUTCHours(endUtc.getUTCHours() + 1)
          }

          const enrichedBlock: AgendaPlanBlock = {
            ...block,
            fecha: startUtc.toISOString(),
            fin: endUtc.toISOString(),
            source: block.origin ?? 'manual'
          }
          enriched.push(enrichedBlock)
          const isProspeccion = block.activity === 'PROSPECCION'
          const isPlanificacionCita = block.activity === 'CITAS' || block.activity === 'SMNYL'
          const busyPlanActivity = isProspeccion || isPlanificacionCita
          if (busyPlanActivity) {
            const usuarioId = plan.agente_id
            const authId = authIdByUsuarioId.get(usuarioId)
            if (authId) {
              const title = isProspeccion
                ? 'Bloque PROSPECCIÓN (planificación)'
                : 'Bloque CITAS (planificación)'
              const defaultDescripcion = isProspeccion
                ? 'Espacio reservado para prospección planificada'
                : block.activity === 'SMNYL'
                  ? 'Espacio reservado para citas planificadas'
                  : null
              busy.push({
                usuarioId,
                usuarioAuthId: authId,
                inicio: startUtc.toISOString(),
                fin: endUtc.toISOString(),
                source: 'planificacion',
                provider: null,
                title,
                descripcion: block.notas || defaultDescripcion,
                prospectoId: block.prospecto_id ?? null,
                citaId: block.agenda_cita_id ?? null,
                planId: plan.id ?? null
              })
            }
          }
        }
        return {
          agenteId: plan.agente_id,
          planId: plan.id ?? null,
          semanaIso: plan.semana_iso,
          anio: plan.anio,
          bloques: enriched
        }
      })

      const response: SlotsResponse = {
        range: { desde: desdeIso, hasta: hastaIso },
        busy: combineBusySlots(busy),
        missingAuth,
        planificaciones,
        warnings: warnings.length ? warnings : undefined
      }
      return NextResponse.json(response)
    }
  }

  const response: SlotsResponse = {
    range: { desde: desdeIso, hasta: hastaIso },
    busy: combineBusySlots(busy),
    missingAuth,
    warnings: warnings.length ? warnings : undefined
  }

  return NextResponse.json(response)
}
