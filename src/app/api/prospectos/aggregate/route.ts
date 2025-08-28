import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'

const supabase = getServiceClient()

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const semana = url.searchParams.get('semana')
  const anio = url.searchParams.get('anio')
  let agenteIdParam = url.searchParams.get('agente_id')
  if (usuario.rol === 'agente') agenteIdParam = String(usuario.id)

  let query = supabase.from('prospectos').select('estado', { count: 'exact', head: false })
  if (semana) query = query.eq('semana_iso', Number(semana))
  if (anio) query = query.eq('anio', Number(anio))
  if (agenteIdParam) query = query.eq('agente_id', Number(agenteIdParam))

  const { data, error } = await query
  if (error || !data) return NextResponse.json({ error: error?.message || 'Error' }, { status: 500 })
  const total = data.length
  const counts = { pendiente:0, seguimiento:0, con_cita:0, descartado:0 }
  type KE = keyof typeof counts
  for (const r of data as Array<{ estado?: KE }>) {
    const e = r.estado
    if (e && counts[e] !== undefined) counts[e]++
  }
  return NextResponse.json({ total, por_estado: counts, cumplimiento_30: total >= 30 })
}
