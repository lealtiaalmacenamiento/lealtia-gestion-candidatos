import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'

const supabase = getServiceClient()

export async function GET() {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const superuser = usuario.rol === 'superusuario' || usuario.rol === 'admin'
  let query = supabase.from('usuarios').select('id,nombre,email,rol,activo').eq('rol','agente').eq('activo', true).order('nombre')
  if (!superuser) {
    query = query.eq('id', usuario.id)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}