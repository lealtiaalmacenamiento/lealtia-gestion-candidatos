import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { obtenerSemanaIso, semanaDesdeNumero } from '@/lib/semanaIso'
import type { AgendaPlanificacionSummary, AgendaPlanBlock } from '@/types'

function canConsultSlots(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (!usuario) return false
  if (usuario.rol === 'admin' || usuario.rol === 'superusuario') return true
  if (usuario.rol === 'agente') return true
  return Boolean(usuario.is_desarrollador)
}

type BusySlot = {
  usuarioId: number
  usuarioAuthId: string
  inicio: string
  fin: string
  source: 'calendar' | 'agenda' | 'planificacion'
  provider?: string | null
  title?: string | null
  descripcion?: string | null
  prospectoId?: number | null
  citaId?: number | null
  planId?: number | null
}

type SlotsResponse = {
  range: { desde?: string | null; hasta?: string | null }
  busy: BusySlot[]
  missingAuth: number[]
  planificaciones?: AgendaPlanificacionSummary[]
  warnings?: string[]
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
      missingAuth
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
          provider: info.meeting_provider,
          title: 'Cita confirmada',
          descripcion: null,
          prospectoId: info.prospecto_id ?? null,
          citaId
        })
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
          const start = new Date(baseDate)
          const hourInt = Number.parseInt(block.hour, 10)
          if (Number.isFinite(hourInt)) {
            start.setUTCHours(hourInt, 0, 0, 0)
          }
          const end = new Date(start)
          end.setUTCHours(end.getUTCHours() + 1)
          const enrichedBlock: AgendaPlanBlock = {
            ...block,
            fecha: start.toISOString(),
            fin: end.toISOString(),
            source: block.origin ?? 'manual'
          }
          enriched.push(enrichedBlock)
          if (block.activity === 'CITAS') {
            const usuarioId = plan.agente_id
            const authId = authIdByUsuarioId.get(usuarioId)
            if (authId) {
              busy.push({
                usuarioId,
                usuarioAuthId: authId,
                inicio: start.toISOString(),
                fin: end.toISOString(),
                source: 'planificacion',
                provider: null,
                title: 'Bloque CITAS (planificación)',
                descripcion: block.notas || null,
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

      // Consolidate busy slots to avoid duplicates with same key/interval/source
      busy.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())

      const response: SlotsResponse = {
        range: { desde: desdeIso, hasta: hastaIso },
        busy,
        missingAuth,
        planificaciones
      }
      return NextResponse.json(response)
    }
  }

  const response: SlotsResponse = {
    range: { desde: desdeIso, hasta: hastaIso },
    busy,
    missingAuth
  }

  return NextResponse.json(response)
}
