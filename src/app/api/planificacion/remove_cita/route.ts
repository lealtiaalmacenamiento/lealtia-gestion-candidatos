import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'

const supabase = getServiceClient()

export async function POST(req: Request) {
  const usuario = await getUsuarioSesion()
  if(!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const body = await req.json() as { prospecto_id?: number; semana_iso?: number; anio?: number; agente_id?: number }
    const prospecto_id = body.prospecto_id
    if(!prospecto_id) return NextResponse.json({ error: 'prospecto_id requerido' }, { status: 400 })
    let agente_id = body.agente_id
    if(usuario.rol === 'agente') agente_id = usuario.id
    if(!agente_id) return NextResponse.json({ error: 'agente_id requerido' }, { status: 400 })
    const semana_iso = body.semana_iso
    const anio = body.anio
    if(!semana_iso || !anio) return NextResponse.json({ error: 'semana_iso y anio requeridos' }, { status: 400 })
    const { data: plan, error } = await supabase.from('planificaciones').select('id,bloques').eq('agente_id', agente_id).eq('semana_iso', semana_iso).eq('anio', anio).maybeSingle()
    if(error) return NextResponse.json({ error: error.message }, { status: 500 })
    if(!plan) return NextResponse.json({ success:true, removed:false })
  interface Bloque { day:number; hour:string; activity:string; origin?:string; prospecto_id?:number }
  const bloques = (plan.bloques||[]) as Bloque[]
    const before = bloques.length
    const filtrados = bloques.filter(b=> !(b.origin==='auto' && b.activity==='CITAS' && b.prospecto_id===prospecto_id))
    if(filtrados.length === before) {
      try { await logAccion('remove_cita_noop', { tabla_afectada: 'planificaciones', snapshot: { agente_id, semana_iso, anio, prospecto_id } }) } catch {}
      return NextResponse.json({ success:true, removed:false })
    }
    const { error: upErr } = await supabase.from('planificaciones').update({ bloques: filtrados, updated_at: new Date().toISOString() }).eq('id', plan.id)
    if(upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    try { await logAccion('remove_cita_bloques', { usuario: usuario.email, tabla_afectada: 'planificaciones', snapshot: { agente_id, semana_iso, anio, prospecto_id, eliminados: before - filtrados.length } }) } catch {}
    return NextResponse.json({ success:true, removed:true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error? e.message: 'Error' }, { status: 500 })
  }
}
