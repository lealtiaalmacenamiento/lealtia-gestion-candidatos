import { NextResponse } from 'next/server'
import { ensureAdminClient, getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'

const supabase = getServiceClient()
const VALID_ROLES = new Set(['admin','supervisor','viewer','agente'])
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(req: Request) {
  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  const idStr = segments[segments.length - 1]
  const { data, error } = await supabase.from('usuarios').select('*').eq('id', idStr).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: Request) {
  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  const idStr = segments[segments.length - 1]
  const targetId = Number(idStr)
  if (!Number.isFinite(targetId)) {
    return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 })
  }

  const actor = await getUsuarioSesion()
  const actorRol = typeof actor?.rol === 'string' ? actor.rol.toLowerCase() : ''
  const actorActivo = !!actor?.activo
  const actorId = actor?.id ?? null
  const isSelf = actorActivo && actorId === targetId
  const canManageOthers = actorActivo && ['admin','supervisor'].includes(actorRol)

  if (!isSelf && !canManageOthers) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const existente = await supabase.from('usuarios').select('*').eq('id', targetId).single()
  if (existente.error) return NextResponse.json({ error: existente.error.message }, { status: 500 })
  const target = existente.data as Record<string, unknown> | null
  if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const targetRol = typeof target.rol === 'string' ? String(target.rol).toLowerCase() : ''
  if (!isSelf && targetRol === 'admin' && actorRol !== 'admin') {
    return NextResponse.json({ error: 'Solo un administrador puede editar a otro administrador' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (typeof body.nombre === 'string') {
    updates.nombre = body.nombre
  }

  if (!isSelf && body.activo !== undefined) {
    updates.activo = !!body.activo
  }

  const requestedRol = typeof body.rol === 'string' ? body.rol.trim().toLowerCase() : undefined
  if (!isSelf && requestedRol) {
    if (!VALID_ROLES.has(requestedRol)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
    }
    updates.rol = requestedRol
  }

  const currentEmail = typeof target.email === 'string' ? String(target.email).trim().toLowerCase() : ''
  const requestedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined

  let shouldUpdateEmail = false
  let newEmail = currentEmail
  let authUserId = typeof target.id_auth === 'string' && target.id_auth ? String(target.id_auth) : null

  if (requestedEmail && requestedEmail !== currentEmail) {
    if (!(isSelf || canManageOthers)) {
      return NextResponse.json({ error: 'Sin permiso para actualizar el correo' }, { status: 403 })
    }
    if (!EMAIL_REGEX.test(requestedEmail)) {
      return NextResponse.json({ error: 'Correo inválido' }, { status: 400 })
    }
    const conflict = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', requestedEmail)
      .neq('id', targetId)
      .limit(1)
      .maybeSingle()
    if (conflict.error) {
      return NextResponse.json({ error: conflict.error.message }, { status: 500 })
    }
    if (conflict.data) {
      return NextResponse.json({ error: 'El correo ya está asignado a otro usuario' }, { status: 409 })
    }
    shouldUpdateEmail = true
    newEmail = requestedEmail
    updates.email = requestedEmail
    if (!authUserId && currentEmail) {
      try {
        const adminClient = ensureAdminClient()
        let page = 1
        const perPage = 200
        while (!authUserId) {
          const { data: pageData, error: pageError } = await adminClient.auth.admin.listUsers({ page, perPage })
          if (pageError) {
            console.warn('[api/usuarios/:id][PUT] No se pudo resolver id_auth', pageError)
            break
          }
          const users = pageData?.users ?? []
          const found = users.find(u => (u.email || '').toLowerCase() === currentEmail)
          if (found) {
            authUserId = found.id
            break
          }
          if (!pageData || !users.length || users.length < perPage) {
            break
          }
          page += 1
        }
      } catch (e) {
        console.warn('[api/usuarios/:id][PUT] No se pudo resolver id_auth', e)
      }
    }
    if (!authUserId) {
      return NextResponse.json({ error: 'No se encontró el usuario de autenticación asociado.' }, { status: 500 })
    }
  }

  const hadEmailChange = shouldUpdateEmail
  const previousEmail = currentEmail
  if (shouldUpdateEmail && authUserId) {
    try {
      const adminClient = ensureAdminClient()
      const authRes = await adminClient.auth.admin.updateUserById(authUserId, { email: newEmail, email_confirm: true })
      if (authRes.error) {
        return NextResponse.json({ error: `No se pudo actualizar el correo en Supabase Auth: ${authRes.error.message}` }, { status: 500 })
      }
      if (!target.id_auth) {
        updates.id_auth = authUserId
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: `No se pudo actualizar el correo en Supabase Auth: ${message}` }, { status: 500 })
    }
  }

  let updatedRecord = existente.data as Record<string, unknown>
  const hasUpdates = Object.keys(updates).length > 0
  if (hasUpdates) {
    const { data, error } = await supabase.from('usuarios').update(updates).eq('id', targetId).select('*').single()
    if (error) {
      if (hadEmailChange && authUserId) {
        try {
          const adminClient = ensureAdminClient()
          await adminClient.auth.admin.updateUserById(authUserId, { email: previousEmail, email_confirm: true })
        } catch (rollbackErr) {
          console.warn('[api/usuarios/:id][PUT] Falló revertir email en Auth tras error BD', rollbackErr)
        }
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    updatedRecord = data as Record<string, unknown>
  }

  if (hasUpdates) {
    const snapshotPayload = hadEmailChange
      ? { previo: existente.data, cambios: { email: { antes: previousEmail || null, despues: newEmail } } }
      : existente.data
    await logAccion('edicion_usuario', {
      usuario: actor?.email || 'desconocido',
      tabla_afectada: 'usuarios',
      id_registro: targetId,
      snapshot: snapshotPayload
    })
  }

  return NextResponse.json(updatedRecord)
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  const idStr = segments[segments.length - 1]
  const usuario = await getUsuarioSesion()
  if (!usuario?.activo || !['admin','supervisor'].includes(usuario.rol))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  let body: { transferTo?: number } = {}
  if (req.headers.get('content-type')?.includes('application/json')) {
    try {
      body = await req.json()
    } catch {/* ignore malformed body; se tratará como vacío */}
  }

  const existente = await supabase.from('usuarios').select('*').eq('id', idStr).single()
  if (existente.error) return NextResponse.json({ error: existente.error.message }, { status: 500 })
  const target = existente.data as { rol?: string } | null
  const targetRol = target?.rol?.toLowerCase()
  if (targetRol === 'admin' && usuario.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo un administrador puede eliminar a otro administrador' }, { status: 403 })
  }

  const authUserId = (existente.data as Record<string, unknown>)?.['id_auth'] as string | undefined || null
  const requiresTransfer = targetRol === 'agente'
  let transferStats: Record<string, number> | null = null

  if (requiresTransfer) {
    const rawTransfer = body?.transferTo
    const transferId = typeof rawTransfer === 'number' ? rawTransfer : Number(rawTransfer)
    if (!transferId || Number.isNaN(transferId)) {
      return NextResponse.json({ error: 'Debes seleccionar a qué agente transferir los registros antes de eliminar.' }, { status: 400 })
    }
    if (transferId === Number(idStr)) {
      return NextResponse.json({ error: 'El agente destino debe ser distinto al agente que deseas eliminar.' }, { status: 400 })
    }

    const { data: destino, error: destinoErr } = await supabase.from('usuarios').select('*').eq('id', transferId).maybeSingle()
    if (destinoErr) return NextResponse.json({ error: destinoErr.message }, { status: 500 })
    if (!destino) return NextResponse.json({ error: 'El agente destino no existe.' }, { status: 404 })
    const destinoRol = String(destino.rol || '').toLowerCase()
    if (destinoRol !== 'agente') {
      return NextResponse.json({ error: 'Debes seleccionar un agente activo como destino.' }, { status: 400 })
    }
    if (!destino.activo) {
      return NextResponse.json({ error: 'El agente destino está inactivo.' }, { status: 400 })
    }

    const rpc = await supabase.rpc('transfer_reassign_usuario', {
      p_old_id: Number(idStr),
      p_new_id: transferId,
      p_actor_email: usuario.email
    })
    if (rpc.error) {
      return NextResponse.json({ error: rpc.error.message }, { status: 500 })
    }
    transferStats = (rpc.data || null) as Record<string, number> | null
  } else {
    const { error } = await supabase.from('usuarios').delete().eq('id', idStr)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Intentar eliminar también en Auth (no revertimos si falla). Guardamos warning.
  let authWarning: string | null = null
  if (authUserId) {
    try {
      const delAuth = await supabase.auth.admin.deleteUser(authUserId)
      if (delAuth.error) {
        authWarning = 'No se pudo eliminar en Auth: ' + delAuth.error.message
        console.warn('[api/usuarios][DELETE] Falló deleteUser auth:', delAuth.error.message)
      }
    } catch (e) {
      authWarning = 'Excepción al eliminar en Auth'
      console.warn('[api/usuarios][DELETE] Excepción eliminando auth user', e)
    }
  }

  const logPayload: Record<string, unknown> = {
    usuario: usuario.email,
    tabla_afectada: 'usuarios',
    id_registro: Number(idStr),
    snapshot: existente.data,
    metadata: transferStats || undefined
  }
  await logAccion(requiresTransfer ? 'transfer_delete_usuario' : 'borrado_usuario', logPayload)

  const response: { success: true; stats?: Record<string, number> | null; warning?: string | null } = { success: true }
  if (transferStats) response.stats = transferStats
  if (authWarning) response.warning = authWarning

  return NextResponse.json(response)
}
