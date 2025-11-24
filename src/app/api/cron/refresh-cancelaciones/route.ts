/**
 * API endpoint para refrescar la vista materializada vw_cancelaciones_indices
 * 
 * Este endpoint debe ser llamado periódicamente (cada 10 minutos) por:
 * - Vercel Cron (si está en Vercel)
 * - GitHub Actions
 * - Cualquier servicio de cron externo
 * 
 * Requiere el header X-Cron-Secret para autenticación
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CRON_SECRET = process.env.REPORTES_CRON_SECRET || process.env.MARKET_SYNC_SECRET;

export async function GET(request: NextRequest) {
  // Validar secreto
  const secret = request.headers.get('x-cron-secret');
  
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Configuración de Supabase no disponible' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    const startTime = Date.now();
    
    // Llamar a la función que refresca la vista materializada
    const { data, error } = await supabase.rpc('refresh_vw_cancelaciones_indices');

    if (error) {
      console.error('[refresh-cancelaciones] Error:', error);
      return NextResponse.json(
        { 
          error: 'Error al refrescar vista materializada',
          details: error.message 
        },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: 'Vista materializada vw_cancelaciones_indices refrescada exitosamente',
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[refresh-cancelaciones] Error inesperado:', err);
    return NextResponse.json(
      { 
        error: 'Error inesperado',
        details: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
