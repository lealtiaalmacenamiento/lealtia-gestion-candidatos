// GET /api/notificaciones
// Lista las notificaciones del usuario actual

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = getServiceClient()
    const { searchParams } = new URL(req.url)
    const leida = searchParams.get('leida') // 'true', 'false', o null (todas)
    const limit = parseInt(searchParams.get('limit') || '50')
    const usuario_id = searchParams.get('usuario_id') // Requerido

    if (!usuario_id) {
      return NextResponse.json({ error: 'Falta usuario_id' }, { status: 400 })
    }

    let query = supabase
      .from('notificaciones')
      .select('*')
      .eq('usuario_id', usuario_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (leida !== null) {
      query = query.eq('leida', leida === 'true')
    }

    const { data: notificaciones, error } = await query

    if (error) {
      console.error('Error consultando notificaciones:', error)
      return NextResponse.json({ error: 'Error al consultar notificaciones' }, { status: 500 })
    }

    // Contar no leídas
    const { count: noLeidas } = await supabase
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('usuario_id', usuario_id)
      .eq('leida', false)

    return NextResponse.json({
      notificaciones: notificaciones || [],
      no_leidas: noLeidas || 0
    })

  } catch (error) {
    console.error('Error en GET /api/notificaciones:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
