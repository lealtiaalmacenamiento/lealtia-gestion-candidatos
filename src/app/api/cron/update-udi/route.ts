/**
 * Endpoint para actualización automática de UDI vía cron job
 * 
 * Para usar con Vercel Cron Jobs o servicios similares:
 * https://vercel.com/docs/cron-jobs
 * 
 * Configurar en vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/update-udi",
 *     "schedule": "0 2 * * *"
 *   }]
 * }
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutos

export async function GET(request: Request) {
  // Verificar token de autorización para seguridad
  const authHeader = request.headers.get('authorization')
  const expectedAuth = process.env.CRON_SECRET 
    ? `Bearer ${process.env.CRON_SECRET}`
    : undefined

  if (expectedAuth && authHeader !== expectedAuth) {
    return NextResponse.json(
      { error: 'Unauthorized' }, 
      { status: 401 }
    )
  }

  try {
    console.log('[cron] Iniciando actualización de UDI...')

    // Importar dinámicamente para evitar problemas con "use server"
    const { execSync } = await import('child_process')

    // 1. Ingestar datos reales desde Banxico
    console.log('[cron] Ingesting data from Banxico...')
    execSync('npm run udi:ingest', {
      stdio: 'inherit',
      env: { ...process.env }
    })

    // 2. Generar proyecciones a 65 años
    console.log('[cron] Generating projections...')
    execSync('npm run udi:project', {
      stdio: 'inherit',
      env: { ...process.env }
    })

    console.log('[cron] ✅ Actualización completada')

    return NextResponse.json({
      success: true,
      message: 'UDI values and projections updated successfully',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[cron] ❌ Error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
