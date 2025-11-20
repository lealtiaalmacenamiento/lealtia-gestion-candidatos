import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'
import { normalizeRole } from '@/lib/roles'

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const clienteId = (id || '').trim()
  if (!clienteId) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const usuario = await getUsuarioSesion()
  if (!usuario?.activo) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = getServiceClient()
  const { data: cliente, error: fetchErr } = await admin
    .from('clientes')
    .select('id, cliente_code, asesor_id, activo')
    .eq('id', clienteId)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  if (cliente.activo === false) {
    return NextResponse.json({ success: true, alreadyInactive: true })
  }

  const role = (usuario.rol || '').toString().toLowerCase()
  const normalizedRole = normalizeRole(usuario.rol)
  const isSuper = normalizedRole === 'admin' || normalizedRole === 'supervisor' || role === 'root'
  const actorAuth = (usuario as { id_auth?: string | null }).id_auth || null
  const isOwner = actorAuth && cliente.asesor_id && actorAuth === cliente.asesor_id
  if (!isSuper && !isOwner) {
    return NextResponse.json({ error: 'Sin permiso para inactivar este cliente' }, { status: 403 })
  }

  const nowIso = new Date().toISOString()
  const { count: polizasEnVigor, error: polizasError } = await admin
    .from('polizas')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', clienteId)
    .eq('estatus', 'EN_VIGOR')
  if (polizasError) {
    return NextResponse.json({ error: polizasError.message }, { status: 500 })
  }
  if ((polizasEnVigor ?? 0) > 0) {
    return NextResponse.json({ error: 'No puedes inactivar clientes con pólizas en vigor', polizasEnVigor }, { status: 409 })
  }

  const updatePayload: Record<string, unknown> = {
    activo: false,
    inactivado_at: nowIso,
    inactivado_por: usuario.id ?? null
  }

  const { data: updated, error: updCliente } = await admin
    .from('clientes')
    .update(updatePayload)
    .eq('id', clienteId)
    .eq('activo', true)
    .select('id, cliente_code')
    .maybeSingle()
  if (updCliente) return NextResponse.json({ error: updCliente.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'El cliente ya estaba inactivo' }, { status: 409 })

  try {
    await logAccion('inactivacion_cliente', {
      usuario: usuario.email,
      tabla_afectada: 'clientes',
      id_registro: null,
      snapshot: {
        cliente_id: (updated as { id: string }).id,
        cliente_code: (updated as { cliente_code?: string | null }).cliente_code || null,
        polizasAnuladas: 0
      }
    })
  } catch {
    // no bloquear por fallo de auditoría
  }

  return NextResponse.json({ success: true, polizasAnuladas: 0 })
}
