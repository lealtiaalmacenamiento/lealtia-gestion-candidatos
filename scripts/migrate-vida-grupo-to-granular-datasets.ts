#!/usr/bin/env node
/**
 * [DEPRECADO] Migración: vida_grupo_inicial → datasets granulares
 * 
 * Este script ya no es necesario. El dataset vida_grupo_inicial fue eliminado.
 * Las campañas existentes deben usar directamente:
 * - polizas_por_tipo: Filtra pólizas por tipos de producto específicos
 * - polizas_prima_minima: Valida pólizas con prima >= umbral
 * - polizas_recientes: Pólizas emitidas en ventana temporal
 * 
 * NOTA: Este archivo se mantiene solo para referencia histórica.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

interface ExistingMetric {
  usuario_id: number
  dataset: string
  metric: string
  numeric_value: number | null
  text_value: string | null
  json_value: unknown
}

async function migrateVidaGrupoInitial() {
  console.log('🔍 Buscando métricas vida_grupo_inicial existentes...')

  const { data: existingMetrics, error } = await supabase
    .from('campaigns_custom_metrics')
    .select('usuario_id, dataset, metric, numeric_value, text_value, json_value')
    .eq('dataset', 'vida_grupo_inicial')

  if (error) {
    console.error('❌ Error consultando métricas:', error.message)
    process.exit(1)
  }

  if (!existingMetrics || existingMetrics.length === 0) {
    console.log('ℹ️  No se encontraron métricas vida_grupo_inicial para migrar')
    return
  }

  console.log(`📊 Encontradas ${existingMetrics.length} métricas vida_grupo_inicial`)

  const userIds = Array.from(new Set(existingMetrics.map((m: ExistingMetric) => m.usuario_id)))
  console.log(`👥 Usuarios afectados: ${userIds.length}`)

  const newMetrics: Array<{
    usuario_id: number
    dataset: string
    metric: string
    numeric_value: number | null
    text_value: string | null
    json_value: unknown
  }> = []

  for (const userId of userIds) {
    const userMetrics = existingMetrics.filter((m: ExistingMetric) => m.usuario_id === userId)
    const polizasValidas = userMetrics.find((m: ExistingMetric) => m.metric === 'polizas_validas')
    const ultimasVentasDias = userMetrics.find((m: ExistingMetric) => m.metric === 'ultimas_ventas_dias')

    // Migrar a polizas_por_tipo
    // Por defecto, las métricas vida_grupo_inicial asumían VI (Vida Individual)
    // ya que VG (Vida Grupo) no existe en la BD
    if (polizasValidas) {
      newMetrics.push({
        usuario_id: userId,
        dataset: 'polizas_por_tipo',
        metric: 'cantidad',
        numeric_value: polizasValidas.numeric_value,
        text_value: null,
        json_value: { product_types: ['VI'] } // Por defecto VI
      })
    }

    // Migrar a polizas_prima_minima (asumimos prima mínima de 25000 MXN)
    if (polizasValidas) {
      newMetrics.push({
        usuario_id: userId,
        dataset: 'polizas_prima_minima',
        metric: 'cantidad',
        numeric_value: polizasValidas.numeric_value,
        text_value: null,
        json_value: { prima_minima_mxn: 25000 }
      })
    }

    // Migrar a polizas_recientes
    if (ultimasVentasDias) {
      newMetrics.push({
        usuario_id: userId,
        dataset: 'polizas_recientes',
        metric: 'ultima_emision_dias',
        numeric_value: ultimasVentasDias.numeric_value,
        text_value: null,
        json_value: null
      })
    }

    if (polizasValidas) {
      // Agregar cantidad de pólizas recientes (asumimos mismo valor que polizas_validas)
      newMetrics.push({
        usuario_id: userId,
        dataset: 'polizas_recientes',
        metric: 'cantidad',
        numeric_value: polizasValidas.numeric_value,
        text_value: null,
        json_value: { dias_ventana: 30 } // Ventana de 30 días por defecto
      })
    }
  }

  console.log(`📝 Insertando ${newMetrics.length} nuevas métricas granulares...`)

  const { error: insertError } = await supabase
    .from('campaigns_custom_metrics')
    .upsert(newMetrics, {
      onConflict: 'usuario_id,dataset,metric'
    })

  if (insertError) {
    console.error('❌ Error insertando nuevas métricas:', insertError.message)
    process.exit(1)
  }

  console.log('✅ Migración completada exitosamente')
  console.log('\n📋 Resumen:')
  console.log(`  - Usuarios migrados: ${userIds.length}`)
  console.log(`  - Nuevas métricas creadas: ${newMetrics.length}`)
  console.log(`  - Datasets creados: polizas_por_tipo, polizas_prima_minima, polizas_recientes`)
  console.log('\n⚠️  NOTA: Las métricas vida_grupo_inicial NO se eliminan (compatibilidad hacia atrás)')
}

migrateVidaGrupoInitial()
  .then(() => {
    console.log('\n✨ Proceso completado')
    process.exit(0)
  })
  .catch(err => {
    console.error('\n❌ Error fatal:', err)
    process.exit(1)
  })
