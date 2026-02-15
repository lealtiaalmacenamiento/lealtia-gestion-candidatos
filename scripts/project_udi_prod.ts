/*
  Proyección de valores UDI a 65 años - PRODUCCIÓN
  
  Ejecuta proyecciones en la base de datos de PRODUCCIÓN (MainDATABASE_URL)
  
  Uso: npx tsx scripts/project_udi_prod.ts
*/

import dotenv from 'dotenv'
import { Pool } from 'pg'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const DATABASE_URL = process.env.MainDATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ MainDATABASE_URL no encontrada en .env.local')
  process.exit(1)
}

const pool = new Pool({ connectionString: DATABASE_URL })

type UdiRow = {
  fecha: string
  valor: string
}

const YEARS_TO_PROJECT = 65
const ANNUAL_INFLATION_RATE = 0.05 // 5% anual

async function projectUDI() {
  console.log('📈 Iniciando proyección de UDI a 65 años en PRODUCCIÓN')
  console.log(`📊 Tasa de inflación anual: ${(ANNUAL_INFLATION_RATE * 100).toFixed(2)}%\n`)

  try {
    // 1. Obtener último valor real de UDI
    const result = await pool.query<UdiRow>(`
      SELECT fecha, valor
      FROM udi_values
      WHERE is_projection = false
      ORDER BY fecha DESC
      LIMIT 1
    `)

    if (result.rows.length === 0) {
      throw new Error('No se encontró ningún valor real de UDI en la base de datos')
    }

    const lastUDI = result.rows[0]
    console.log(`💰 Último UDI real: ${parseFloat(lastUDI.valor).toFixed(6)} (${lastUDI.fecha})`)

    // 2. Calcular tasa diaria
    const dailyRate = Math.pow(1 + ANNUAL_INFLATION_RATE, 1 / 365) - 1

    // 3. Generar proyecciones
    console.log(`🔢 Generando ${YEARS_TO_PROJECT * 365} proyecciones diarias...`)
    const projections: Array<{
      fecha: string
      valor: number
      is_projection: boolean
      source: string
      fetched_at: string
      stale: boolean
    }> = []
    
    let currentValue = parseFloat(lastUDI.valor)
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

    console.log(`✅ ${projections.length} proyecciones generadas`)

    // 4. Limpiar proyecciones antiguas
    console.log('\n🗑️  Eliminando proyecciones anteriores...')
    const deleteResult = await pool.query(`
      DELETE FROM udi_values WHERE is_projection = true
    `)
    console.log(`   Eliminadas: ${deleteResult.rowCount} proyecciones antiguas`)

    // 5. Insertar nuevas proyecciones en lotes
    console.log('\n💾 Guardando nuevas proyecciones...')
    const batchSize = 1000
    let inserted = 0
    
    for (let i = 0; i < projections.length; i += batchSize) {
      const batch = projections.slice(i, i + batchSize)
      
      // Construir valores para INSERT
      const values: any[] = []
      const placeholders = batch.map((proj, idx) => {
        const baseIdx = idx * 6
        values.push(
          proj.fecha,
          proj.valor,
          proj.is_projection,
          proj.source,
          proj.fetched_at,
          proj.stale
        )
        return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6})`
      }).join(',')

      await pool.query(`
        INSERT INTO udi_values (fecha, valor, is_projection, source, fetched_at, stale)
        VALUES ${placeholders}
      `, values)
      
      inserted += batch.length
      const percent = ((inserted / projections.length) * 100).toFixed(1)
      console.log(`   ✓ ${inserted}/${projections.length} registros (${percent}%)`)
    }

    const finalValue = projections[projections.length - 1]
    const incremento = ((finalValue.valor / parseFloat(lastUDI.valor) - 1) * 100)
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ PROYECCIÓN COMPLETADA EN PRODUCCIÓN')
    console.log('='.repeat(60))
    console.log(`📅 Fecha inicial:          ${lastUDI.fecha}`)
    console.log(`📅 Fecha final proyectada: ${finalValue.fecha}`)
    console.log(`💰 UDI inicial:            ${parseFloat(lastUDI.valor).toFixed(6)}`)
    console.log(`💰 UDI proyectado (${YEARS_TO_PROJECT} años): ${finalValue.valor.toFixed(6)}`)
    console.log(`📈 Incremento total:       ${incremento.toFixed(2)}%`)
    console.log(`📊 Tasa anual efectiva:    ${(ANNUAL_INFLATION_RATE * 100).toFixed(2)}%`)
    console.log(`📝 Registros insertados:   ${inserted}`)
    console.log('='.repeat(60))

  } catch (error) {
    console.error('\n❌ Error en proyección:', error)
    throw error
  } finally {
    await pool.end()
  }
}

projectUDI()
  .then(() => {
    console.log('\n🎉 Proceso finalizado exitosamente')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Error fatal:', error.message)
    process.exit(1)
  })
