import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'

const supabase = getServiceClient()

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
  const usuario = await getUsuarioSesion()
  if (!usuario?.activo || !['admin','superusuario'].includes(usuario.rol))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const existente = await supabase.from('usuarios').select('*').eq('id', idStr).single()
  if (existente.error) return NextResponse.json({ error: existente.error.message }, { status: 500 })
  // Regla: solo un admin puede modificar a otro admin. Un superusuario NO puede editar admins.
  const target = existente.data as { rol?: string } | null
  const targetRol = target?.rol?.toLowerCase()
  if (targetRol === 'admin' && usuario.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo un administrador puede editar a otro administrador' }, { status: 403 })
  }

  const body = await req.json()
  const { data, error } = await supabase.from('usuarios').update(body).eq('id', idStr).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('edicion_usuario', { usuario: usuario.email, tabla_afectada: 'usuarios', id_registro: Number(idStr), snapshot: existente.data })

  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  const idStr = segments[segments.length - 1]
  const usuario = await getUsuarioSesion()
  if (!usuario?.activo || !['admin','superusuario'].includes(usuario.rol))
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
