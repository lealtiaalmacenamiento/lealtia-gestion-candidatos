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

/**
 * PATCH /api/clientes/[id]
 * Permite a supervisores mover un cliente a otro agente actualizando su asesor_id
 * Las pólizas del cliente se mueven automáticamente porque están vinculadas por cliente_id
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const usuario = await getUsuarioSesion()
    if (!usuario) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const role = (usuario.rol || '').toLowerCase()
    const isSuper = ['supervisor', 'super_usuario', 'admin'].includes(role)
    
    if (!isSuper) {
      return NextResponse.json(
        { error: 'Solo supervisores pueden mover clientes entre agentes' },
        { status: 403 }
      )
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'ID de cliente requerido' }, { status: 400 })
    }

    const body = await req.json().catch(() => null) as {
      asesor_id?: string | null
    } | null

    if (!body || !body.asesor_id) {
      return NextResponse.json(
        { error: 'asesor_id es requerido' },
        { status: 400 }
      )
    }

    const admin = getServiceClient()

    // Verificar que el cliente existe
    const { data: clienteExistente, error: clienteError } = await admin
      .from('clientes')
      .select('id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, email:correo, asesor_id')
      .eq('id', id)
      .maybeSingle()

    if (clienteError) {
      return NextResponse.json({ error: clienteError.message }, { status: 500 })
    }

    if (!clienteExistente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // Verificar que el agente destino existe y está activo
    const { data: agenteDestino, error: agenteError } = await admin
      .from('usuarios')
      .select('id, id_auth, email, nombre, activo')
      .eq('id_auth', body.asesor_id)
      .maybeSingle()

    if (agenteError) {
      return NextResponse.json({ error: agenteError.message }, { status: 500 })
    }

    if (!agenteDestino) {
      return NextResponse.json(
        { error: 'El agente destino no existe' },
        { status: 404 }
      )
    }

    type AgenteRow = { activo?: boolean | null }
    if (!(agenteDestino as AgenteRow).activo) {
      return NextResponse.json(
        { error: 'El agente destino no está activo' },
        { status: 400 }
      )
    }

    // Verificar que no es el mismo agente
    type ClienteRow = { asesor_id?: string | null }
    if ((clienteExistente as ClienteRow).asesor_id === body.asesor_id) {
      return NextResponse.json(
        { error: 'El cliente ya pertenece a este agente' },
        { status: 400 }
      )
    }

    // Actualizar el asesor_id del cliente
    const { data: clienteActualizado, error: updateError } = await admin
      .from('clientes')
      .update({ asesor_id: body.asesor_id })
      .eq('id', id)
      .select('id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, email:correo, asesor_id')
      .maybeSingle()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Auditoría: log de la transferencia
    try {
      type EmailRow = { email?: string | null }
      const userEmail = (usuario as unknown as EmailRow).email || null
      type ClienteEmailRow = { email?: string | null }
      const clienteEmail = (clienteExistente as unknown as ClienteEmailRow).email || null
      
      await logAccion('transferencia_cliente', {
        usuario: userEmail || undefined,
        tabla_afectada: 'clientes',
        id_registro: null, // UUID no es compatible con number, usar null
        snapshot: {
          cliente_id: id,
          cliente_email: clienteEmail,
          asesor_anterior: (clienteExistente as ClienteRow).asesor_id,
          asesor_nuevo: body.asesor_id
        }
      })
    } catch (e) {
      console.error('[PATCH /api/clientes/[id]] Error logging acción:', e)
    }

    // Notificar al nuevo agente
    try {
      type AgenteIdRow = { id?: number | null }
      const agenteId = (agenteDestino as AgenteIdRow).id
      type ClienteNamesRow = {
        primer_nombre?: string | null
        segundo_nombre?: string | null
        primer_apellido?: string | null
        segundo_apellido?: string | null
      }
      type ClienteEmailRow = { email?: string | null }
      const nombres = clienteExistente as ClienteNamesRow
      const clienteEmail = (clienteExistente as unknown as ClienteEmailRow).email || null
      const nombreCompleto = [
        nombres.primer_nombre,
        nombres.segundo_nombre,
        nombres.primer_apellido,
        nombres.segundo_apellido
      ].filter(Boolean).join(' ')

      if (agenteId) {
        await admin.from('notificaciones').insert({
          usuario_id: agenteId,
          tipo: 'sistema',
          titulo: 'Cliente asignado',
          mensaje: `Se te asignó el cliente ${nombreCompleto || clienteEmail || id}`,
          leida: false,
          metadata: { cliente_id: id, tipo_operacion: 'transferencia' }
        })
      }
    } catch (e) {
      console.error('[PATCH /api/clientes/[id]] Error creando notificación:', e)
    }

    return NextResponse.json({
      success: true,
      cliente: clienteActualizado
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    console.error('[PATCH /api/clientes/[id]]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
