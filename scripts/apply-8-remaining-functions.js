#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

async function applyMigration() {
  const migrationPath = path.join(__dirname, '../supabase/migrations/20251211_fix_8_remaining_functions.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')
  
  console.log('📝 Aplicando corrección de 8 funciones...\n')
  
  // DEV
  console.log('🔄 Aplicando a DEV...')
  const devPool = new Pool({ connectionString: process.env.DevDATABASE_URL })
  try {
    await devPool.query(sql)
    console.log('✅ DEV actualizado\n')
  } catch (e) {
    console.error('❌ DEV error:', e.message)
    console.error('Detalles:', e.detail || e.hint || '')
  } finally {
    await devPool.end()
  }
  
  // MAIN
  console.log('🔄 Aplicando a MAIN...')
  const mainPool = new Pool({ connectionString: process.env.MainDATABASE_URL })
  try {
    await mainPool.query(sql)
    console.log('✅ MAIN actualizado\n')
  } catch (e) {
    console.error('❌ MAIN error:', e.message)
    console.error('Detalles:', e.detail || e.hint || '')
  } finally {
    await mainPool.end()
  }
  
  // Verificar
  console.log('🧪 Verificando funciones corregidas...')
  const verifyPool = new Pool({ connectionString: process.env.DevDATABASE_URL })
  try {
    const result = await verifyPool.query(`
      SELECT 
        p.proname,
        CASE 
          WHEN pg_get_functiondef(p.oid) LIKE '%public.%' THEN 'OK'
          ELSE 'FALTA'
        END as status
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'apply_cliente_update', 'apply_poliza_update', 'apply_poliza_update_dbg',
          'polizas_before_insupd_enforce_moneda', 'producto_parametros_after_update_sync_moneda',
          'recalc_polizas_by_producto_parametro', 'recalc_puntos_poliza', 'recalc_puntos_poliza_all'
        )
      ORDER BY p.proname
    `)
    
    result.rows.forEach(row => {
      const icon = row.status === 'OK' ? '✅' : '❌'
      console.log(`${icon} ${row.proname}: ${row.status}`)
    })
    
  } finally {
    await verifyPool.end()
  }
}

applyMigration()
