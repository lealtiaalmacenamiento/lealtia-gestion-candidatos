/**
 * Script para verificar triggers y funciones en BD DEV
 */

const { Client } = require('pg')
require('dotenv').config({ path: '.env.local' })

const DEV_DB_URL = process.env.DevDATABASE_URL

if (!DEV_DB_URL) {
  console.error('❌ Falta DevDATABASE_URL en .env.local')
  process.exit(1)
}

const client = new Client({ connectionString: DEV_DB_URL })

async function main() {
  console.log('🔍 Verificando triggers y funciones en BD DEV\n')
  console.log('='.repeat(80))

  try {
    await client.connect()
    console.log('✅ Conectado a BD Dev\n')

    // 1. Verificar triggers en tabla polizas
    console.log('📋 TRIGGERS EN TABLA POLIZAS:\n')
    
    const triggersResult = await client.query(`
      SELECT 
        tgname as trigger_name,
        tgtype,
        tgenabled as enabled,
        pg_get_triggerdef(oid) as definition
      FROM pg_trigger
      WHERE tgrelid = 'polizas'::regclass
        AND tgisinternal = false
      ORDER BY tgname
    `)

    if (triggersResult.rows.length === 0) {
      console.log('⚠️  No se encontraron triggers en tabla polizas\n')
    } else {
      for (const trigger of triggersResult.rows) {
        const enabled = trigger.enabled === 'O' ? '✅ Habilitado' : '❌ Deshabilitado'
        console.log(`${enabled} ${trigger.trigger_name}`)
        console.log(`   ${trigger.definition}\n`)
      }
    }

    // 2. Verificar función recalc_puntos_poliza
    console.log('='.repeat(80))
    console.log('🔧 FUNCIÓN recalc_puntos_poliza:\n')

    const recalcFuncResult = await client.query(`
      SELECT 
        proname as function_name,
        pg_get_function_arguments(oid) as arguments,
        pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname LIKE '%recalc_puntos%'
      ORDER BY proname
    `)

    if (recalcFuncResult.rows.length === 0) {
      console.log('❌ No se encontró función recalc_puntos_poliza\n')
    } else {
      for (const func of recalcFuncResult.rows) {
        console.log(`✅ ${func.function_name}(${func.arguments})`)
        console.log(`   Primeras 500 chars de definición:`)
        console.log(`   ${func.definition.substring(0, 500)}...\n`)
      }
    }

    // 3. Verificar función normalize_prima
    console.log('='.repeat(80))
    console.log('🔧 FUNCIÓN normalize_prima:\n')

    const normalizeFuncResult = await client.query(`
      SELECT 
        proname as function_name,
        pg_get_function_arguments(oid) as arguments,
        pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname LIKE '%normalize_prima%'
      ORDER BY proname
    `)

    if (normalizeFuncResult.rows.length === 0) {
      console.log('❌ No se encontró función normalize_prima\n')
    } else {
      for (const func of normalizeFuncResult.rows) {
        console.log(`✅ ${func.function_name}(${func.arguments})`)
        console.log(`   Primeras 500 chars de definición:`)
        console.log(`   ${func.definition.substring(0, 500)}...\n`)
      }
    }

    // 4. Verificar triggers relacionados con puntos
    console.log('='.repeat(80))
    console.log('🔍 TODOS LOS TRIGGERS RELACIONADOS CON PUNTOS/RECALC:\n')

    const allTriggersResult = await client.query(`
      SELECT 
        t.tgname as trigger_name,
        c.relname as table_name,
        t.tgenabled as enabled,
        pg_get_triggerdef(t.oid) as definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE t.tgisinternal = false
        AND (t.tgname LIKE '%puntos%' OR t.tgname LIKE '%recalc%')
      ORDER BY c.relname, t.tgname
    `)

    if (allTriggersResult.rows.length === 0) {
      console.log('⚠️  No se encontraron triggers relacionados con puntos/recalc\n')
    } else {
      for (const trigger of allTriggersResult.rows) {
        const enabled = trigger.enabled === 'O' ? '✅' : '❌'
        console.log(`${enabled} ${trigger.table_name}.${trigger.trigger_name}`)
        console.log(`   ${trigger.definition}\n`)
      }
    }

    // 5. Verificar todas las funciones relacionadas con polizas
    console.log('='.repeat(80))
    console.log('🔍 FUNCIONES RELACIONADAS CON POLIZAS:\n')

    const polizaFuncsResult = await client.query(`
      SELECT 
        proname as function_name,
        pg_get_function_arguments(oid) as arguments
      FROM pg_proc
      WHERE proname LIKE '%poliza%' OR proname LIKE '%puntos%'
      ORDER BY proname
    `)

    if (polizaFuncsResult.rows.length === 0) {
      console.log('⚠️  No se encontraron funciones relacionadas\n')
    } else {
      for (const func of polizaFuncsResult.rows) {
        console.log(`   📌 ${func.function_name}(${func.arguments})`)
      }
      console.log('')
    }

    console.log('='.repeat(80))
    console.log('✅ Verificación completada\n')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    throw error
  } finally {
    await client.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
