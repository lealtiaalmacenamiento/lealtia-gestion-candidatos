#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

async function applyFix() {
  const migrationPath = path.join(__dirname, '../supabase/migrations/20251211_fix_remaining_9_functions.sql')
  
  if (!fs.existsSync(migrationPath)) {
    console.error('❌ Migración no encontrada')
    process.exit(1)
  }
  
  const sql = fs.readFileSync(migrationPath, 'utf8')
  
  console.log('📝 Aplicando correcciones a 9 funciones...\n')
  
  // DEV
  console.log('🔄 DEV...')
  const devPool = new Pool({ connectionString: process.env.DevDATABASE_URL })
  try {
    await devPool.query(sql)
    console.log('✅ DEV actualizado\n')
  } catch (e) {
    console.error('❌ DEV error:', e.message)
  } finally {
    await devPool.end()
  }
  
  // MAIN
  console.log('🔄 MAIN...')
  const mainPool = new Pool({ connectionString: process.env.MainDATABASE_URL })
  try {
    await mainPool.query(sql)
    console.log('✅ MAIN actualizado\n')
  } catch (e) {
    console.error('❌ MAIN error:', e.message)
  } finally {
    await mainPool.end()
  }
  
  console.log('🧪 Verificando...')
  const devPool2 = new Pool({ connectionString: process.env.DevDATABASE_URL })
  try {
    const result = await devPool2.query(`
      SELECT COUNT(*) as count
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
        AND pg_get_functiondef(p.oid) LIKE '%public.%'
        AND p.proname IN (
          'apply_cliente_update', 'apply_poliza_update', 'recalc_puntos_poliza',
          'trigger_invalidate_cache_on_polizas'
        )
    `)
    console.log(`✅ ${result.rows[0].count} funciones verificadas con schema explícito`)
  } finally {
    await devPool2.end()
  }
}

applyFix()
