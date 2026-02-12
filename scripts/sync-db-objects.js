/**
 * Script para sincronizar funciones, triggers y vistas entre Dev y Main
 */

const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const DEV_URL = process.env.DevDATABASE_URL
const MAIN_URL = process.env.MainDATABASE_URL

async function getDefinition(pool, type, name) {
  try {
    if (type === 'function') {
      const result = await pool.query(`
        SELECT pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = $1
      `, [name])
      return result.rows[0]?.definition
    } else if (type === 'trigger') {
      const result = await pool.query(`
        SELECT pg_get_triggerdef(oid) as definition
        FROM pg_trigger
        WHERE tgname = $1
      `, [name])
      return result.rows[0]?.definition
    } else if (type === 'view') {
      const result = await pool.query(`
        SELECT pg_get_viewdef(c.oid, true) as definition
        FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'v'
      `, [name])
      const viewDef = result.rows[0]?.definition
      if (viewDef) {
        return `CREATE OR REPLACE VIEW ${name} AS\n${viewDef}`
      }
    }
  } catch (err) {
    console.error(`Error obteniendo definición de ${type} ${name}:`, err.message)
  }
  return null
}

async function applySQL(pool, sql, description) {
  try {
    await pool.query(sql)
    console.log(`✅ ${description}`)
    return true
  } catch (err) {
    console.error(`❌ Error ${description}:`, err.message)
    return false
  }
}

async function main() {
  console.log('🔄 SINCRONIZANDO FUNCIONES, TRIGGERS Y VISTAS')
  console.log(`📅 ${new Date().toISOString()}\n`)
  
  const devPool = new Pool({ connectionString: DEV_URL })
  const mainPool = new Pool({ connectionString: MAIN_URL })
  
  let syncCount = 0
  let errorCount = 0
  
  // 1. Copiar is_super_role_wrapper de DEV a MAIN
  console.log('='.repeat(80))
  console.log('📦 Copiando is_super_role_wrapper de DEV → MAIN')
  console.log('='.repeat(80))
  const isSuperRoleWrapper = await getDefinition(devPool, 'function', 'is_super_role_wrapper')
  if (isSuperRoleWrapper) {
    const success = await applySQL(mainPool, isSuperRoleWrapper, 'is_super_role_wrapper aplicada a MAIN')
    syncCount += success ? 1 : 0
    errorCount += success ? 0 : 1
  } else {
    console.log('⚠️  No se encontró is_super_role_wrapper en DEV')
  }
  
  // 2. Copiar clean_stale_campaign_cache de MAIN a DEV
  console.log('\n' + '='.repeat(80))
  console.log('📦 Copiando clean_stale_campaign_cache de MAIN → DEV')
  console.log('='.repeat(80))
  const cleanStale = await getDefinition(mainPool, 'function', 'clean_stale_campaign_cache')
  if (cleanStale) {
    const success = await applySQL(devPool, cleanStale, 'clean_stale_campaign_cache aplicada a DEV')
    syncCount += success ? 1 : 0
    errorCount += success ? 0 : 1
  } else {
    console.log('⚠️  No se encontró clean_stale_campaign_cache en MAIN')
  }
  
  // 3. Copiar trg_generar_pagos_auto de DEV a MAIN
  console.log('\n' + '='.repeat(80))
  console.log('📦 Copiando trg_generar_pagos_auto de DEV → MAIN')
  console.log('='.repeat(80))
  const triggerDef = await getDefinition(devPool, 'trigger', 'trg_generar_pagos_auto')
  if (triggerDef) {
    const success = await applySQL(mainPool, triggerDef, 'trg_generar_pagos_auto aplicado a MAIN')
    syncCount += success ? 1 : 0
    errorCount += success ? 0 : 1
  } else {
    console.log('⚠️  No se encontró trg_generar_pagos_auto en DEV')
  }
  
  // 4. Copiar vw_cancelaciones_indices de MAIN a DEV
  console.log('\n' + '='.repeat(80))
  console.log('📦 Copiando vw_cancelaciones_indices de MAIN → DEV')
  console.log('='.repeat(80))
  const viewDef = await getDefinition(mainPool, 'view', 'vw_cancelaciones_indices')
  if (viewDef) {
    const success = await applySQL(devPool, viewDef, 'vw_cancelaciones_indices aplicada a DEV')
    syncCount += success ? 1 : 0
    errorCount += success ? 0 : 1
  } else {
    console.log('⚠️  No se encontró vw_cancelaciones_indices en MAIN')
  }
  
  await devPool.end()
  await mainPool.end()
  
  console.log('\n' + '='.repeat(80))
  console.log('📊 RESUMEN DE SINCRONIZACIÓN')
  console.log('='.repeat(80))
  console.log(`✅ Elementos sincronizados: ${syncCount}`)
  console.log(`❌ Errores: ${errorCount}`)
  
  if (errorCount === 0) {
    console.log('\n✅ SINCRONIZACIÓN COMPLETA EXITOSA')
  } else {
    console.log('\n⚠️  SINCRONIZACIÓN COMPLETADA CON ERRORES')
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  })
