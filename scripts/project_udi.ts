/*
  Proyección de valores UDI a 65 años
  
  Requisitos env:
  - NEXT_PUBLIC_SUPABASE_URL: URL del proyecto
  - SUPABASE_SERVICE_ROLE_KEY: clave service role (para escribir sin RLS)
  
  Genera proyecciones basadas en tasa de inflación del 5% anual
*/

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const YEARS_TO_PROJECT = 65
const ANNUAL_INFLATION_RATE = 0.05 // 5% anual

async function projectUDI() {
  console.log('📈 Iniciando proyección de UDI a 65 años con tasa del 5%...')

  // 1. Obtener último valor real de UDI
  const { data: lastUDI, error } = await supabase
    .from('udi_values')
    .select('fecha, valor')
    .or('is_projection.is.null,is_projection.eq.false')
    .order('fecha', { ascending: false })
    .limit(1)
    .single()

  if (error || !lastUDI) {
    throw new Error('No se pudo obtener el último valor de UDI: ' + (error?.message || 'sin datos'))
  }

  console.log(`💰 Último UDI: ${lastUDI.valor.toFixed(6)} (${lastUDI.fecha})`)

  // 2. Calcular tasa diaria
  const dailyRate = Math.pow(1 + ANNUAL_INFLATION_RATE, 1 / 365) - 1

  // 3. Generar proyecciones
  const projections: Array<{ fecha: string; valor: number; is_projection: boolean; source: string; fetched_at: string; stale: boolean }> = []
  let currentValue = lastUDI.valor
  const date = new Date(lastUDI.fecha)

  for (let i = 1; i <= YEARS_TO_PROJECT * 365; i++) {
    date.setDate(date.getDate() + 1)
    currentValue = currentValue * (1 + dailyRate)
    
    projections.push({
      fecha: date.toISOString().split('T')[0],
      valor: currentValue,
      is_projection: true,
      source: 'projection',
      fetched_at: new Date().toISOString(),
      stale: false
    })
  }

  // 4. Limpiar proyecciones antiguas
  console.log('🗑️  Eliminando proyecciones anteriores...')
  const { error: deleteError } = await supabase
    .from('udi_values')
    .delete()
    .eq('is_projection', true)

  if (deleteError) {
    console.warn('Advertencia al eliminar proyecciones antiguas:', deleteError.message)
  }

  // 5. Insertar nuevas proyecciones en lotes
  console.log('💾 Guardando proyecciones...')
  const batchSize = 1000
  let inserted = 0
  
  for (let i = 0; i < projections.length; i += batchSize) {
    const batch = projections.slice(i, i + batchSize)
    
    const { error: insertError } = await supabase
      .from('udi_values')
      .insert(batch)
    
    if (insertError) {
      console.error(`Error insertando lote ${Math.floor(i / batchSize) + 1}:`, insertError)
      throw insertError
    }
    
    inserted += batch.length
    console.log(`  ✓ ${inserted}/${projections.length} registros`)
  }

  const finalValue = projections[projections.length - 1]
  console.log('\n✅ Proyección completada')
  console.log(`📅 Fecha inicial: ${lastUDI.fecha}`)
  console.log(`📅 Fecha final proyectada: ${finalValue.fecha}`)
  console.log(`💰 UDI inicial: ${lastUDI.valor.toFixed(6)}`)
  console.log(`💰 UDI proyectado (${YEARS_TO_PROJECT} años): ${finalValue.valor.toFixed(6)}`)
  console.log(`📈 Incremento total: ${((finalValue.valor / lastUDI.valor - 1) * 100).toFixed(2)}%`)
  console.log(`📊 Tasa anual efectiva: ${(ANNUAL_INFLATION_RATE * 100).toFixed(2)}%`)
}

projectUDI()
  .then(() => {
    console.log('\n🎉 Proceso finalizado exitosamente')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Error en proyección:', error)
    process.exit(1)
  })
