import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'

export async function GET() {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const usuarioId = Number(usuario.id)
  const supa = getServiceClient()
  const { data, error } = await supa.from('agente_meta').select('*').eq('usuario_id', usuarioId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data || { usuario_id: usuarioId, fecha_conexion_text: null, objetivo: null })
}

export async function POST(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json().catch(()=>null) as { fecha_conexion_text?: string | null; objetivo?: number | null } | null
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  const targetId = Number(usuario.id)

  // Validar formato D/M/YYYY si viene
  const txt = (body.fecha_conexion_text || '').trim()
  if (txt) {
    const parts = txt.split('/')
    if (parts.length !== 3) return NextResponse.json({ error: 'fecha_conexion_text debe ser D/M/YYYY' }, { status: 400 })
    const d = Number(parts[0]); const m = Number(parts[1]); const y = Number(parts[2])
    if (!isFinite(d) || !isFinite(m) || !isFinite(y) || d<1 || d>31 || m<1 || m>12 || y<1900) return NextResponse.json({ error: 'fecha_conexion_text inválida' }, { status: 400 })
  }
  const objetivo = (body.objetivo==null) ? null : Number(body.objetivo)
  if (objetivo!=null && !isFinite(objetivo)) return NextResponse.json({ error: 'objetivo inválido' }, { status: 400 })

  const supa = getServiceClient()
  const payload = { usuario_id: targetId, fecha_conexion_text: txt || null, objetivo: objetivo as number | null }
  const { data, error } = await supa.from('agente_meta').upsert(payload, { onConflict: 'usuario_id' }).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
