#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Aplica fix completo de todas las funciones con usuarios a BD DEV
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const DATABASE_URL = process.env.DevDATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ DevDATABASE_URL no encontrada en .env.local')
  process.exit(1)
}

async function applyMigration() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    console.log('🔄 Conectando a DEV database...\n')
    
    const functionsPath = path.join(__dirname, '../supabase/migrations/20251211_fix_all_usuarios_functions.sql')
    const functionsSql = fs.readFileSync(functionsPath, 'utf8')
    
    console.log('📝 Ejecutando migración de 6 funciones...')
    await pool.query(functionsSql)
    console.log('✅ Todas las funciones actualizadas\n')
    
    // Verify
    console.log('🧪 Verificando funciones corregidas...')
    const result = await pool.query(`
      SELECT proname
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
        AND pg_get_functiondef(p.oid) ILIKE '%public.usuarios%'
        AND proname IN (
          'calculate_campaign_datasets_for_user',
          'evaluate_all_campaigns',
          'transfer_reassign_usuario',
          'trigger_invalidate_cache_on_candidatos',
          'trigger_invalidate_cache_on_clientes',
          'trigger_invalidate_cache_on_prospectos'
        )
      ORDER BY proname
    `)
    
    console.log(`✅ ${result.rows.length}/6 funciones con schema explícito:`)
    result.rows.forEach(row => {
      console.log(`   - ${row.proname}`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

applyMigration()
