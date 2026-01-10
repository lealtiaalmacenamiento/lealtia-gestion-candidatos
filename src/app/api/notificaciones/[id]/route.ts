// PATCH /api/notificaciones/[id]
// Marca una notificación como leída

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notifIdStr } = await params
  const notifId = parseInt(notifIdStr)
  if (isNaN(notifId)) {
    return NextResponse.json({ error: 'ID de notificación inválido' }, { status: 400 })
  }

  try {
    const supabase = getServiceClient()
    const body = await req.json()
    const { leida } = body

    if (typeof leida !== 'boolean') {
      return NextResponse.json({ error: 'Campo "leida" debe ser booleano' }, { status: 400 })
    }

    // Actualizar notificación
    const { data, error } = await supabase
      .from('notificaciones')
      .update({
        leida,
        leida_at: leida ? new Date().toISOString() : null
      })
      .eq('id', notifId)
      .select()
      .single()

    if (error) {
      console.error('Error actualizando notificación:', error)
      return NextResponse.json({ 
        error: 'Error al actualizar notificación' 
      }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ 
        error: 'Notificación no encontrada o no tienes permiso' 
      }, { status: 404 })
    }

    return NextResponse.json({ notificacion: data })

  } catch (error) {
    console.error('Error en PATCH /api/notificaciones/[id]:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
