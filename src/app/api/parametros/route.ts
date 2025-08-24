import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import type { Parametro } from '@/types'
import { logAccion } from '@/lib/logger'

// Listar parámetros
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tipo = searchParams.get('tipo')

  let query = supabase.from('Parametros').select('*')
  if (tipo) {
    query = query.eq('tipo', tipo)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }

  // Log consulta (sin usuario explícito; podría añadirse si se obtiene de sesión)
  await logAccion('listado_parametros', { tabla_afectada: 'parametros', snapshot: { count: (data || []).length, filtro: tipo } })
  return NextResponse.json<{ success: boolean; data: Parametro[] }>({
    success: true,
    data: data as Parametro[]
  })
}

// Actualizar parámetro
export async function PUT(request: Request) {
  try {
    const body: Partial<Parametro> & { solicitante: string } = await request.json()

    if (!body.id) {
      return NextResponse.json({ success: false, message: 'Falta el ID del parámetro' }, { status: 400 })
    }

    const { data, error } = await supabase.from('Parametros').update(body).eq('id', body.id).select()
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

  await logAccion('actualizacion_parametro', { usuario: body.solicitante, tabla_afectada: 'parametros', id_registro: body.id, snapshot: data })

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: false, message: 'Error al actualizar parámetro' }, { status: 500 })
  }
}
