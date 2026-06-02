import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; pasoId: string }> }

const supabase = ensureAdminClient()

export async function PATCH(req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { pasoId } = await context.params
  const body = await req.json() as { dias_espera?: number; mensaje?: string; activo?: boolean }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.dias_espera !== undefined) update.dias_espera = body.dias_espera
  if (body.mensaje !== undefined) update.mensaje = body.mensaje
  if (body.activo !== undefined) update.activo = body.activo

  const { data, error } = await supabase
    .from('sp_secuencia_pasos')
    .update(update)
    .eq('id', pasoId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { pasoId } = await context.params

  const { error } = await supabase
    .from('sp_secuencia_pasos')
    .delete()
    .eq('id', pasoId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}
