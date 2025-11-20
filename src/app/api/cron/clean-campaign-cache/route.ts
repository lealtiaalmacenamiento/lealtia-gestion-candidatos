import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

/**
 * Endpoint para limpiar cache de campaign_progress
 * 
 * Uso:
 * 1. Llamada manual: GET /api/cron/clean-campaign-cache
 * 2. Vercel Cron (vercel.json): se ejecuta automáticamente cada 10 minutos
 * 3. Con token de autenticación: ?token=CRON_SECRET
 */
export async function GET(request: NextRequest) {
  try {
    // Verificar token de seguridad (recomendado para producción)
    const authHeader = request.headers.get('authorization')
    const queryToken = request.nextUrl.searchParams.get('token')
    const expectedToken = process.env.CRON_SECRET

    if (expectedToken && authHeader !== `Bearer ${expectedToken}` && queryToken !== expectedToken) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const supabase = getServiceClient()
    const maxAgeMinutes = parseInt(request.nextUrl.searchParams.get('maxAge') || '5', 10)

    // Eliminar registros evaluados hace más de X minutos
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString()
    
    const { data: deletedRows, error } = await supabase
      .from('campaign_progress')
      .delete()
      .lt('evaluated_at', cutoffTime)
      .select('id')

    if (error) {
      console.error('[cron] Error limpiando cache:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const deletedCount = deletedRows?.length ?? 0
    console.log(`[cron] Cache limpiado: ${deletedCount} registros eliminados (más antiguos que ${maxAgeMinutes}min)`)

    return NextResponse.json({
      success: true,
      deletedCount,
      cutoffTime,
      maxAgeMinutes
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    console.error('[cron] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
