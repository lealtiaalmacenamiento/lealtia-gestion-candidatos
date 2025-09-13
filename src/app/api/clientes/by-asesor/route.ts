import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  const role = (usuario?.rol || '').toString().toLowerCase()
  const isSuper = ['superusuario','super_usuario','supervisor','admin','root'].includes(role)
  if (!isSuper) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const asesorId = (url.searchParams.get('asesor_id') || '').trim()
  if (!asesorId) return NextResponse.json({ error: 'asesor_id requerido' }, { status: 400 })

  const admin = getServiceClient()
  const { data, error } = await admin
    .from('clientes')
    .select('id, cliente_code, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono_celular, email:correo, fecha_nacimiento')
    .eq('asesor_id', asesorId)
    .order('id', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ items: data || [] })
}
