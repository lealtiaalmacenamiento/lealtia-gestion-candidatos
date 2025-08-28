import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { obtenerSemanaIso, semanaDesdeNumero } from '@/lib/semanaIso'

const supabase = getServiceClient()

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const semana = url.searchParams.get('semana')
  const anio = url.searchParams.get('anio')
  let agenteIdParam = url.searchParams.get('agente_id')
  if (usuario.rol === 'agente') agenteIdParam = String(usuario.id)
  const soloConCita = url.searchParams.get('solo_con_cita') === '1'

  let query = supabase.from('prospectos').select('estado, semana_iso, anio, fecha_cita', { count: 'exact', head: false })
  if (anio) query = query.eq('anio', Number(anio))
  if (agenteIdParam) query = query.eq('agente_id', Number(agenteIdParam))
  if (soloConCita) query = query.not('fecha_cita','is',null)
  if (semana) {
    const anioNum = anio ? Number(anio) : obtenerSemanaIso(new Date()).anio
    const semNum = Number(semana)
    const rango = semanaDesdeNumero(anioNum, semNum)
    const inicioISO = rango.inicio.toISOString()
    const finPlus1 = new Date(rango.fin); finPlus1.setUTCDate(finPlus1.getUTCDate()+1)
    const finISO = finPlus1.toISOString()
    query = query.or(
      `and(semana_iso.eq.${semNum},anio.eq.${anioNum}),and(fecha_cita.gte.${inicioISO},fecha_cita.lt.${finISO})`
    )
  }

  const { data, error } = await query
  if (error || !data) return NextResponse.json({ error: error?.message || 'Error' }, { status: 500 })
  const total = data.length
  const counts = { pendiente:0, seguimiento:0, con_cita:0, descartado:0 }
  type KE = keyof typeof counts
  for (const r of data as Array<{ estado?: KE }>) {
    const e = r.estado
    if (e && counts[e] !== undefined) counts[e]++
  }
  // Ganancia estimada (cuando se necesite) considerará solo pendiente, seguimiento y con_cita
  return NextResponse.json({ total, por_estado: counts, cumplimiento_30: total >= 30 })
}
