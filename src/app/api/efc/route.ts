import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { normalizeDateFields } from '@/lib/dateUtils'

const supabase = getServiceClient()

export async function GET() {
  const { data, error } = await supabase.from('efc').select('*').order('id', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const usuario = await getUsuarioSesion()
  const rol = usuario?.rol ? String(usuario.rol).trim().toLowerCase() : undefined
  const allowed = ['admin','supervisor']
  if (!usuario?.activo || !rol || !allowed.includes(rol)) {
    const url = new URL(req.url)
    const debug = url.searchParams.get('debug') === '1'
    return NextResponse.json({ error: 'Sin permiso', ...(debug ? { rol, activo: usuario?.activo } : {}) }, { status: 403 })
  }

  const body = await req.json()
  normalizeDateFields(body)
  const { data, error } = await supabase.from('efc').insert([body]).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  interface EfcInsert { id?: number }
  const idLog = (data as EfcInsert)?.id
  await logAccion('alta_efc', { usuario: usuario.email, tabla_afectada: 'efc', id_registro: idLog, snapshot: data })

  return NextResponse.json(data)
}
