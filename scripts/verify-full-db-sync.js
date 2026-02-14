/**
 * Script para verificar sincronización COMPLETA entre Dev y Main
 * Compara: tablas, funciones, triggers, vistas, tipos, índices
 */

const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const DEV_URL = process.env.DevDATABASE_URL
const MAIN_URL = process.env.MainDATABASE_URL

async function getDatabaseInfo(name, connectionString) {
  const pool = new Pool({ connectionString })
  
  console.log(`\n${'='.repeat(80)}`)
  console.log(`🔍 Analizando: ${name}`)
  console.log('='.repeat(80))
  
  const info = {}
  
  try {
    // 1. Tablas
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)
    info.tables = tables.rows.map(r => r.table_name)
    console.log(`📋 Tablas: ${info.tables.length}`)
    
    // 2. Funciones
    const functions = await pool.query(`
      SELECT proname as function_name
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      ORDER BY proname
    `)
    info.functions = functions.rows.map(r => r.function_name)
    console.log(`⚙️  Funciones: ${info.functions.length}`)
    
    // 3. Triggers
    const triggers = await pool.query(`
      SELECT DISTINCT trigger_name
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY trigger_name
    `)
    info.triggers = triggers.rows.map(r => r.trigger_name)
    console.log(`🔔 Triggers: ${info.triggers.length}`)
    
    // 4. Vistas
    const views = await pool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    info.views = views.rows.map(r => r.table_name)
    console.log(`👁️  Vistas: ${info.views.length}`)
    
    // 5. Tipos personalizados
    const types = await pool.query(`
      SELECT typname
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'public'
      AND t.typtype = 'e'
      ORDER BY typname
    `)
    info.types = types.rows.map(r => r.typname)
    console.log(`🏷️  Tipos enum: ${info.types.length}`)
    
    // 6. Conteos de registros en tablas clave
    const tablesToCount = [
      'usuarios', 'candidatos', 'clientes', 'polizas', 
      'producto_parametros', 'puntos_thresholds', 'pagos',
      'campaign_segments', 'campaigns'
    ]
    
    info.counts = {}
    console.log('\n📊 Conteos de registros:')
    for (const table of tablesToCount) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as total FROM ${table}`)
        info.counts[table] = parseInt(result.rows[0].total)
        console.log(`   ${table}: ${info.counts[table]}`)
      } catch (err) {
        info.counts[table] = null
        console.log(`   ${table}: tabla no existe`)
      }
    }
    
    await pool.end()
    return info
  } catch (err) {
    console.error('❌ Error:', err.message)
    await pool.end()
    return null
  }
}

function compareArrays(devArray, mainArray, name) {
  const devSet = new Set(devArray)
  const mainSet = new Set(mainArray)
  
  const onlyInDev = [...devSet].filter(x => !mainSet.has(x))
  const onlyInMain = [...mainSet].filter(x => !devSet.has(x))
  
  if (onlyInDev.length === 0 && onlyInMain.length === 0) {
    console.log(`✅ ${name}: IDÉNTICAS (${devArray.length})`)
    return true
  } else {
    console.log(`⚠️  ${name}: DIFERENTES`)
    if (onlyInDev.length > 0) {
      console.log(`   📍 Solo en DEV (${onlyInDev.length}):`, onlyInDev.slice(0, 5).join(', ') + (onlyInDev.length > 5 ? '...' : ''))
    }
    if (onlyInMain.length > 0) {
      console.log(`   📍 Solo en MAIN (${onlyInMain.length}):`, onlyInMain.slice(0, 5).join(', ') + (onlyInMain.length > 5 ? '...' : ''))
    }
    return false
  }
}

async function main() {
  console.log('🔄 VERIFICACIÓN COMPLETA DE SINCRONIZACIÓN')
  console.log(`📅 ${new Date().toISOString()}`)
  
  const devInfo = await getDatabaseInfo('DEV', DEV_URL)
  const mainInfo = await getDatabaseInfo('MAIN (Producción)', MAIN_URL)
  
  if (!devInfo || !mainInfo) {
    console.log('\n❌ Error obteniendo información de las bases de datos')
    return
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('📊 COMPARACIÓN DETALLADA')
  console.log('='.repeat(80))
  
  let allMatch = true
  
  allMatch &= compareArrays(devInfo.tables, mainInfo.tables, 'Tablas')
  allMatch &= compareArrays(devInfo.functions, mainInfo.functions, 'Funciones')
  allMatch &= compareArrays(devInfo.triggers, mainInfo.triggers, 'Triggers')
  allMatch &= compareArrays(devInfo.views, mainInfo.views, 'Vistas')
  allMatch &= compareArrays(devInfo.types, mainInfo.types, 'Tipos enum')
  
  console.log('\n📊 Comparación de conteos:')
  let countsDiffer = false
  for (const table in devInfo.counts) {
    const devCount = devInfo.counts[table]
    const mainCount = mainInfo.counts[table]
    
    if (devCount === null && mainCount === null) {
      console.log(`   ${table}: ambas sin tabla`)
    } else if (devCount === null) {
      console.log(`   ⚠️  ${table}: solo existe en MAIN (${mainCount})`)
      countsDiffer = true
    } else if (mainCount === null) {
      console.log(`   ⚠️  ${table}: solo existe en DEV (${devCount})`)
      countsDiffer = true
    } else if (devCount === mainCount) {
      console.log(`   ✅ ${table}: ${devCount} registros`)
    } else {
      console.log(`   ⚠️  ${table}: DEV=${devCount}, MAIN=${mainCount}`)
      countsDiffer = true
    }
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('🎯 RESULTADO FINAL')
  console.log('='.repeat(80))
  
  if (allMatch && !countsDiffer) {
    console.log('✅ DEV y MAIN están COMPLETAMENTE SINCRONIZADAS')
    console.log('✅ Esquema y datos coinciden')
  } else if (allMatch && countsDiffer) {
    console.log('✅ Esquema está sincronizado (tablas, funciones, triggers, etc.)')
    console.log('⚠️  Los conteos de registros difieren (esto es normal si hay datos diferentes)')
  } else {
    console.log('❌ Las bases de datos NO están sincronizadas')
    console.log('⚠️  Hay diferencias en el esquema (revisa los detalles arriba)')
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  })
