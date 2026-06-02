import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const supabase = ensureAdminClient()

export async function GET(_req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await context.params

  const { data, error } = await supabase
    .from('sp_secuencia_pasos')
    .select('*')
    .eq('campana_id', id)
    .order('paso', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pasos: data ?? [] })
}

export async function POST(req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id } = await context.params
  const body = await req.json() as { paso?: number; dias_espera?: number; mensaje?: string; activo?: boolean }

  if (!body.mensaje?.trim()) return NextResponse.json({ error: 'mensaje es requerido' }, { status: 400 })
  if (!body.paso || body.paso < 1) return NextResponse.json({ error: 'paso debe ser >= 1' }, { status: 400 })

  const { data, error } = await supabase
    .from('sp_secuencia_pasos')
    .insert({
      campana_id: id,
      paso: body.paso,
      dias_espera: body.dias_espera ?? 3,
      mensaje: body.mensaje.trim(),
      activo: body.activo ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
