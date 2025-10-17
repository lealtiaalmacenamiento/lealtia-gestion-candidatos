import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'
import type { IntegrationProvider } from '@/lib/integrationTokens'

function canManageAgenda(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (!usuario) return false
  if (usuario.rol === 'admin' || usuario.rol === 'superusuario') return true
  return Boolean(usuario.is_desarrollador)
}

function canReadAgenda(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (canManageAgenda(usuario)) return true
  return usuario?.rol === 'agente'
}

type UsuarioAgenda = {
  id: number
  email: string
  nombre?: string | null
  rol: string
  activo: boolean
  is_desarrollador: boolean
  id_auth?: string | null
  tokens: IntegrationProvider[]
}

export async function GET(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!canReadAgenda(actor)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const url = new URL(req.url)
  const soloDesarrolladores = url.searchParams.get('solo_desarrolladores') === '1'
  const soloActivos = url.searchParams.get('solo_activos') === '1'

  const supabase = ensureAdminClient()
  const { data: usuarios, error } = await supabase
    .from('usuarios')
    .select('id,email,nombre,rol,activo,is_desarrollador,id_auth')
    .order('email', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const filtered = (usuarios || []).filter((u) => {
    if (soloDesarrolladores && !u.is_desarrollador) return false
    if (soloActivos && u.activo === false) return false
    return true
  })

  const authIds = filtered
    .map((u) => u.id_auth)
    .filter((id): id is string => Boolean(id))

  const tokensByUsuario = new Map<string, IntegrationProvider[]>()
  if (authIds.length > 0) {
    const { data: tokens, error: tokenError } = await supabase
      .from('tokens_integracion')
      .select('usuario_id, proveedor')
      .in('usuario_id', authIds)

    if (!tokenError) {
      for (const row of tokens || []) {
        if (!row?.usuario_id || !row?.proveedor) continue
        const existing = tokensByUsuario.get(row.usuario_id) || []
        if (!existing.includes(row.proveedor as IntegrationProvider)) {
          existing.push(row.proveedor as IntegrationProvider)
        }
        tokensByUsuario.set(row.usuario_id, existing)
      }
    }
  }

  const payload: UsuarioAgenda[] = filtered.map((u) => ({
    id: u.id,
    email: u.email,
    nombre: u.nombre ?? null,
    rol: u.rol,
    activo: u.activo,
    is_desarrollador: Boolean(u.is_desarrollador),
    id_auth: u.id_auth ?? null,
    tokens: u.id_auth ? tokensByUsuario.get(u.id_auth) || [] : []
  }))

  try {
    await logAccion('listar_desarrolladores_agenda', {
      usuario: actor.email,
      tabla_afectada: 'usuarios',
      snapshot: { count: payload.length, soloDesarrolladores, soloActivos }
    })
  } catch {}

  return NextResponse.json({ usuarios: payload })
}

type PatchPayload = {
  usuarioId: number
  isDesarrollador: boolean
}

export async function PATCH(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!canManageAgenda(actor)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const updates: PatchPayload[] = Array.isArray(body) ? body : [body as PatchPayload]
  if (!updates.length) {
    return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })
  }

  const supabase = ensureAdminClient()
  const resultado: UsuarioAgenda[] = []

  for (const item of updates) {
    const usuarioId = Number(item?.usuarioId)
    const isDesarrollador = Boolean(item?.isDesarrollador)
    if (!Number.isFinite(usuarioId)) {
      return NextResponse.json({ error: 'usuarioId inválido' }, { status: 400 })
    }

    const { data: existente, error: fetchError } = await supabase
      .from('usuarios')
      .select('id,email,nombre,rol,activo,is_desarrollador,id_auth')
      .eq('id', usuarioId)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }
    if (!existente) {
      return NextResponse.json({ error: `Usuario ${usuarioId} no encontrado` }, { status: 404 })
    }

    if (Boolean(existente.is_desarrollador) === isDesarrollador) {
      resultado.push({
        id: existente.id,
        email: existente.email,
        nombre: existente.nombre ?? null,
        rol: existente.rol,
        activo: existente.activo,
        is_desarrollador: Boolean(existente.is_desarrollador),
        id_auth: existente.id_auth ?? null,
        tokens: []
      })
      continue
    }

    const { data: updated, error: updateError } = await supabase
      .from('usuarios')
      .update({ is_desarrollador: isDesarrollador })
      .eq('id', usuarioId)
      .select('id,email,nombre,rol,activo,is_desarrollador,id_auth')
      .maybeSingle()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    if (!updated) {
      return NextResponse.json({ error: `No fue posible actualizar usuario ${usuarioId}` }, { status: 500 })
    }

    resultado.push({
      id: updated.id,
      email: updated.email,
      nombre: updated.nombre ?? null,
      rol: updated.rol,
      activo: updated.activo,
      is_desarrollador: Boolean(updated.is_desarrollador),
      id_auth: updated.id_auth ?? null,
      tokens: []
    })
  }

  const resultadoAuthIds = resultado
    .map((r) => r.id_auth)
    .filter((id): id is string => Boolean(id))

  if (resultadoAuthIds.length > 0) {
    const { data: tokens, error: tokenError } = await supabase
      .from('tokens_integracion')
      .select('usuario_id, proveedor')
      .in('usuario_id', resultadoAuthIds)

    if (!tokenError) {
      for (const usuario of resultado) {
        if (!usuario.id_auth) continue
        const matches = (tokens || []).filter((t) => t.usuario_id === usuario.id_auth)
        usuario.tokens = matches.map((t) => t.proveedor as IntegrationProvider)
      }
    }
  }

  try {
    await logAccion('actualiza_desarrolladores_agenda', {
      usuario: actor.email,
      tabla_afectada: 'usuarios',
      snapshot: { updates: resultado.map((r) => ({ id: r.id, is_desarrollador: r.is_desarrollador })) }
    })
  } catch {}

  return NextResponse.json({ usuarios: resultado })
}
