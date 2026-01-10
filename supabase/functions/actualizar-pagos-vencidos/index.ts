// Edge Function: Actualizar pagos vencidos
// Se ejecuta diariamente vía GitHub Actions para marcar pagos pendientes como vencidos

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validar secret para seguridad
    const authHeader = req.headers.get('authorization')
    const secret = Deno.env.get('CRON_SECRET') || Deno.env.get('REPORTES_CRON_SECRET')
    
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Crear cliente Supabase con service_role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Llamar función SQL que actualiza pagos vencidos
    const { data, error } = await supabase.rpc('fn_actualizar_pagos_vencidos')
    
    if (error) {
      console.error('Error actualizando pagos:', error)
      throw error
    }
    
    const updatedCount = data?.[0]?.updated_count || 0

    console.log(`✅ Pagos actualizados: ${updatedCount}`)

    // Generar notificaciones in-app para pagos vencidos
    let notificacionesCreadas = 0
    if (updatedCount > 0) {
      notificacionesCreadas = await generarNotificacionesPagosVencidos(supabase)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: updatedCount,
        notificaciones_creadas: notificacionesCreadas,
        timestamp: new Date().toISOString(),
        message: `${updatedCount} pago(s) marcado(s) como vencido(s), ${notificacionesCreadas} notificación(es) enviada(s)`
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error en Edge Function:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

// Función auxiliar: Generar notificaciones para pagos vencidos
async function generarNotificacionesPagosVencidos(supabase: any): Promise<number> {
  try {
    // Obtener pagos vencidos del día (recién actualizados)
    const hoyInicio = new Date()
    hoyInicio.setHours(0, 0, 0, 0)
    
    const { data: pagosVencidos, error } = await supabase
      .from('poliza_pagos_mensuales')
      .select(`
        id,
        poliza_id,
        periodo_mes,
        monto_programado,
        fecha_limite,
        polizas!inner(
          numero,
          asesor_id,
          clientes!inner(nombre_completo)
        )
      `)
      .eq('estado', 'vencido')
      .gte('updated_at', hoyInicio.toISOString())

    if (error || !pagosVencidos || pagosVencidos.length === 0) {
      console.log('No hay pagos vencidos nuevos para notificar')
      return 0
    }

    console.log(`Generando notificaciones para ${pagosVencidos.length} pagos vencidos`)

    // Agrupar pagos por asesor
    const pagosPorAsesor = new Map<string, any[]>()
    
    for (const pago of pagosVencidos) {
      const asesorId = pago.polizas?.asesor_id
      if (!asesorId) continue
      
      if (!pagosPorAsesor.has(asesorId)) {
        pagosPorAsesor.set(asesorId, [])
      }
      pagosPorAsesor.get(asesorId)!.push(pago)
    }

    // Crear notificaciones agrupadas por asesor
    const notificaciones = []
    for (const [asesorId, pagos] of pagosPorAsesor.entries()) {
      const count = pagos.length
      const primerPago = pagos[0]
      
      notificaciones.push({
        usuario_id: asesorId,
        tipo: 'pago_vencido',
        titulo: count === 1 
          ? '⚠️ Pago Vencido'
          : `⚠️ ${count} Pagos Vencidos`,
        mensaje: count === 1
          ? `El pago de ${primerPago.polizas.clientes.nombre_completo} (Póliza ${primerPago.polizas.numero}) ha vencido.`
          : `Tienes ${count} pagos vencidos hoy. Revisa el dashboard de pagos.`,
        leida: false,
        metadata: {
          pago_ids: pagos.map(p => p.id),
          poliza_ids: pagos.map(p => p.poliza_id),
          monto_total: pagos.reduce((sum, p) => sum + (p.monto_programado || 0), 0),
          fecha_limite: primerPago.fecha_limite
        }
      })
    }

    // Insertar notificaciones
    const { error: insertError } = await supabase
      .from('notificaciones')
      .insert(notificaciones)

    if (insertError) {
      console.error('Error insertando notificaciones:', insertError)
      return 0
    }

    console.log(`✅ ${notificaciones.length} notificación(es) creada(s)`)
    return notificaciones.length

  } catch (error) {
    console.error('Error generando notificaciones:', error)
    return 0
  }
}
