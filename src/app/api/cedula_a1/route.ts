import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'

const supabase = getServiceClient()

export async function GET() {
  const { data, error } = await supabase.from('cedula_a1').select('*').order('mes')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario?.activo || !['admin','superusuario'].includes(usuario.rol))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const allowedFields = new Set(['mes','periodo_para_registro_y_envio_de_documentos','capacitacion_cedula_a1'])
  const invalid = Object.keys(body).filter(k=>!allowedFields.has(k))
  if (invalid.length) {
    return NextResponse.json({ error:'Campos no permitidos', invalid, permitidos: Array.from(allowedFields) }, { status:400 })
  }
  const { data, error } = await supabase.from('cedula_a1').insert([body]).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  interface CedulaA1Insert { id?: number }
  const idLog = (data as CedulaA1Insert)?.id
  await logAccion('alta_cedula_a1', { usuario: usuario.email, tabla_afectada: 'cedula_a1', id_registro: idLog, snapshot: data })

  return NextResponse.json(data)
}
