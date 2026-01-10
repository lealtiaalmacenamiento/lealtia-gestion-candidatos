// POST /api/notificaciones/marcar-todas-leidas
// Marca todas las notificaciones del usuario como leídas

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceClient()
    const body = await req.json()
    const { usuario_id } = body

    if (!usuario_id) {
      return NextResponse.json({ error: 'Falta usuario_id' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('notificaciones')
      .update({ 
        leida: true,
        leida_at: new Date().toISOString()
      })
      .eq('usuario_id', usuario_id)
      .eq('leida', false)
      .select()

    if (error) {
      console.error('Error marcando notificaciones:', error)
      return NextResponse.json({ 
        error: 'Error al marcar notificaciones como leídas' 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      actualizadas: data?.length || 0
    })

  } catch (error) {
    console.error('Error en POST /api/notificaciones/marcar-todas-leidas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
