import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'

function canConsultSlots(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (!usuario) return false
  if (usuario.rol === 'admin' || usuario.rol === 'superusuario') return true
  return Boolean(usuario.is_desarrollador)
}

type BusySlot = {
  usuarioId: number
  usuarioAuthId: string
  inicio: string
  fin: string
}

type SlotsResponse = {
  range: { desde?: string | null; hasta?: string | null }
  busy: BusySlot[]
  missingAuth: number[]
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
  const missingAuth: number[] = []

  for (const usuario of usuarios || []) {
    if (!usuario.id_auth) {
      missingAuth.push(usuario.id)
      continue
    }
    usuarioIdByAuthId.set(usuario.id_auth, usuario.id)
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
      fin: row.fin
    })
  }

  const response: SlotsResponse = {
    range: { desde: desdeIso, hasta: hastaIso },
    busy,
    missingAuth
  }

  return NextResponse.json(response)
}
