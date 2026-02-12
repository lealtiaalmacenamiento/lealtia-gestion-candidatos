/**
 * Script para verificar que Dev y Main están sincronizadas
 */

const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const DEV_URL = process.env.DevDATABASE_URL
const MAIN_URL = process.env.MainDATABASE_URL

async function checkDatabase(name, connectionString) {
  const pool = new Pool({ connectionString })
  
  console.log(`\n${'='.repeat(80)}`)
  console.log(`🔍 Verificando: ${name}`)
  console.log('='.repeat(80))
  
  try {
    // Verificar tabla puntos_thresholds
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'puntos_thresholds'
      ) as exists
    `)
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ Tabla puntos_thresholds NO existe')
      await pool.end()
      return null
    }
    
    console.log('✅ Tabla puntos_thresholds existe')
    
    // Contar registros
    const count = await pool.query('SELECT COUNT(*) as total FROM puntos_thresholds')
    console.log(`📊 Total de registros: ${count.rows[0].total}`)
    
    // Obtener configuración
    const thresholds = await pool.query(`
      SELECT tipo_producto, umbral_min, umbral_max, puntos, clasificacion, orden
      FROM puntos_thresholds
      WHERE activo = true
      ORDER BY tipo_producto, orden
    `)
    
    console.log('\n📋 Configuración de umbrales:')
    thresholds.rows.forEach(t => {
      console.log(`   ${t.tipo_producto}: ${t.umbral_min} - ${t.umbral_max || '∞'} → ${t.puntos} puntos (${t.clasificacion})`)
    })
    
    // Verificar función recalc_puntos_poliza actualizada
    const funcCheck = await pool.query(`
      SELECT pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'recalc_puntos_poliza'
    `)
    
    if (funcCheck.rows.length > 0) {
      const hasThresholdQuery = funcCheck.rows[0].definition.includes('FROM puntos_thresholds')
      if (hasThresholdQuery) {
        console.log('✅ Función recalc_puntos_poliza actualizada (usa puntos_thresholds)')
      } else {
        console.log('⚠️  Función recalc_puntos_poliza NO actualizada (usa lógica hardcodeada)')
      }
    }
    
    await pool.end()
    return thresholds.rows
  } catch (err) {
    console.error('❌ Error:', err.message)
    await pool.end()
    return null
  }
}

async function main() {
  console.log('🔄 VERIFICACIÓN DE SINCRONIZACIÓN DE BASES DE DATOS')
  console.log(`📅 ${new Date().toISOString()}\n`)
  
  const devData = await checkDatabase('DEV', DEV_URL)
  const mainData = await checkDatabase('MAIN (Producción)', MAIN_URL)
  
  console.log('\n' + '='.repeat(80))
  console.log('📊 RESUMEN')
  console.log('='.repeat(80))
  
  if (!devData || !mainData) {
    console.log('❌ Una o ambas bases de datos no tienen las migraciones aplicadas')
    return
  }
  
  if (devData.length === mainData.length) {
    console.log(`✅ Ambas bases tienen ${devData.length} umbrales configurados`)
    
    // Comparar contenido
    const devHash = JSON.stringify(devData.map(d => ({ ...d, orden: undefined })))
    const mainHash = JSON.stringify(mainData.map(d => ({ ...d, orden: undefined })))
    
    if (devHash === mainHash) {
      console.log('✅ Las configuraciones son IDÉNTICAS')
      console.log('✅ DEV y MAIN están sincronizadas')
    } else {
      console.log('⚠️  Las configuraciones tienen diferencias')
      console.log('⚠️  Revisa los detalles arriba')
    }
  } else {
    console.log(`⚠️  DEV tiene ${devData.length} umbrales, MAIN tiene ${mainData.length} umbrales`)
    console.log('⚠️  Las bases NO están sincronizadas')
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  })
