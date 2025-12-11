#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Aplica fix de is_super_role search_path a BD DEV
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
    
    const migrationPath = path.join(__dirname, '../supabase/migrations/20251211_fix_is_super_role_search_path.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')
    
    console.log('📝 Ejecutando migración...')
    await pool.query(sql)
    
    console.log('✅ Migración aplicada exitosamente a DEV\n')
    
    // Test the function
    console.log('🧪 Verificando función is_super_role...')
    const result = await pool.query("SELECT proname, prosrc FROM pg_proc WHERE proname = 'is_super_role'")
    
    if (result.rows.length > 0) {
      console.log('✅ Función is_super_role actualizada correctamente')
      console.log(`   Configuración: ${result.rows[0].prosrc.includes('public.usuarios') ? 'Schema explícito ✓' : 'Schema NO explícito ✗'}`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

applyMigration()
