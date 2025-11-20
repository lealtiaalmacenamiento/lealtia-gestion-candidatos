import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { normalizeRole } from '@/lib/roles'

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  const role = (usuario?.rol || '').toString().toLowerCase()
  const normalizedRole = normalizeRole(usuario?.rol)
  const isSuper = normalizedRole === 'admin' || normalizedRole === 'supervisor' || role === 'root'
  if (!isSuper) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  let asesorId = (url.searchParams.get('asesor_id') || '').trim()
  const usuarioId = (url.searchParams.get('usuario_id') || '').trim()
  const emailParam = (url.searchParams.get('email') || '').trim().toLowerCase()

  // Resolver asesor_id a partir de usuario_id o email si no fue proporcionado id_auth directo
  if (!asesorId) {
    if (!usuarioId && !emailParam) {
      return NextResponse.json({ error: 'asesor_id, usuario_id o email requerido' }, { status: 400 })
    }
    const adminResolve = getServiceClient()
    try {
      if (usuarioId) {
        const { data, error } = await adminResolve.from('usuarios').select('id_auth').eq('id', Number(usuarioId)).maybeSingle()
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        asesorId = (data?.id_auth || '').toString().trim()
      } else if (emailParam) {
        const { data, error } = await adminResolve.from('usuarios').select('id_auth').ilike('email', emailParam).maybeSingle()
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        asesorId = (data?.id_auth || '').toString().trim()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error resolviendo asesor'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    if (!asesorId) return NextResponse.json({ error: 'No se pudo resolver asesor_id' }, { status: 400 })
  }

  const admin = getServiceClient()
  const includeInactivos = url.searchParams.get('include_inactivos') === '1'

  let query = admin
    .from('clientes')
    .select('id, cliente_code, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono_celular, email:correo, fecha_nacimiento, activo, inactivado_at', { count: 'exact' })
    .eq('asesor_id', asesorId)
    .order('id', { ascending: true })

  if (!includeInactivos) {
    query = query.eq('activo', true)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ items: data || [], count: typeof count === 'number' ? count : (data?.length || 0) })
}
