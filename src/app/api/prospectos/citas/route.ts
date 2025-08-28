import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { semanaDesdeNumero } from '@/lib/semanaIso'

const supabase = getServiceClient()

export async function GET(req: Request){
  const user = await getUsuarioSesion()
  if(!user) return NextResponse.json({error:'No autenticado'},{status:401})
  const url = new URL(req.url)
  const semana = Number(url.searchParams.get('semana'))
  const anio = Number(url.searchParams.get('anio'))
  let agenteId = url.searchParams.get('agente_id')
  if(user.rol==='agente') agenteId = String(user.id)
  if(!semana || !anio) return NextResponse.json({error:'semana y anio requeridos'},{status:400})
  const rango = semanaDesdeNumero(anio, semana)
  const inicioISO = rango.inicio.toISOString()
  const finPlus1 = new Date(rango.fin); finPlus1.setUTCDate(finPlus1.getUTCDate()+1)
  const finISO = finPlus1.toISOString()
  let q = supabase.from('prospectos').select('id,fecha_cita').not('fecha_cita','is',null)
    .gte('fecha_cita', inicioISO).lt('fecha_cita', finISO)
  if(agenteId) q = q.eq('agente_id', Number(agenteId))
  const { data, error } = await q
  if(error) return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json(data)
}