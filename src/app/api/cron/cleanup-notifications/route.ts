// POST /api/cron/cleanup-notifications
// Elimina notificaciones leídas con más de 7 días de antigüedad

import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    // Validar autorización: Vercel Cron o secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.REPORTES_CRON_SECRET || process.env.CRON_SECRET
    const isVercelCron = req.headers.get('x-vercel-cron')
    
    if (!isVercelCron && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const supabase = getServiceClient()
    
    // Calcular fecha límite: hace 7 días
    const hace7Dias = new Date()
    hace7Dias.setDate(hace7Dias.getDate() - 7)

    // Eliminar notificaciones leídas con updated_at anterior a hace 7 días
    const { error, count } = await supabase
      .from('notificaciones')
      .delete({ count: 'exact' })
      .eq('leida', true)
      .lt('updated_at', hace7Dias.toISOString())

    if (error) {
      console.error('[cleanup-notifications] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const deletedCount = count || 0
    console.log(`[cleanup-notifications] Eliminadas ${deletedCount} notificaciones leídas antiguas`)

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[cleanup-notifications] Error inesperado:', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
