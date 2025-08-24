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

  const existente = await supabase.from('usuarios').select('*').eq('id', idStr).single()
  if (existente.error) return NextResponse.json({ error: existente.error.message }, { status: 500 })

  const authUserId = (existente.data as Record<string, unknown>)?.['id_auth'] as string | undefined || null

  const { error } = await supabase.from('usuarios').delete().eq('id', idStr)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

  await logAccion('borrado_usuario', { usuario: usuario.email, tabla_afectada: 'usuarios', id_registro: Number(idStr), snapshot: existente.data })

  return NextResponse.json(authWarning ? { success: true, warning: authWarning } : { success: true })
}
