/**
 * PATCH /api/polizas/[id]/auto-pago
 * Activa o desactiva el auto-pago de una póliza.
 * Solo accessible para supervisores y desarrolladores comerciales.
 *
 * Body: { auto_pago: boolean }
 */
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { isSuperRole } from '@/lib/roles'
import { logAccion } from '@/lib/logger'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await getUsuarioSesion(request.headers)
  if (!usuario) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const canAct = isSuperRole(usuario.rol) || Boolean(usuario.is_desarrollador)
  if (!canAct) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id: polizaId } = await params
  if (!polizaId) {
    return NextResponse.json({ error: 'ID de póliza inválido' }, { status: 400 })
  }

  let body: { auto_pago?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (typeof body.auto_pago !== 'boolean') {
    return NextResponse.json({ error: 'auto_pago debe ser un booleano' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('polizas')
    .update({ auto_pago: body.auto_pago })
    .eq('id', polizaId)
    .select('id, auto_pago')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Error al actualizar' }, { status: 500 })
  }

  void logAccion('toggle_auto_pago_poliza', {
    tabla_afectada: 'polizas',
    id_registro: polizaId,
    snapshot: { auto_pago: body.auto_pago }
  })

  return NextResponse.json({ success: true, poliza: data })
}
