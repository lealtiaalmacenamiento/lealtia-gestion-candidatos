#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Aplica fix de is_super_role y prospectos policies search_path a BD MAIN (producción)
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const DATABASE_URL = process.env.MainDATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ MainDATABASE_URL no encontrada en .env.local')
  process.exit(1)
}

async function applyMigration() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    console.log('🔄 Conectando a MAIN database...\n')
    
    // Apply prospectos policies fix
    const prospectosPath = path.join(__dirname, '../supabase/migrations/20251211_fix_prospectos_policies_search_path.sql')
    const prospectosSql = fs.readFileSync(prospectosPath, 'utf8')
    
    console.log('📝 Ejecutando migración de políticas prospectos...')
    await pool.query(prospectosSql)
    console.log('✅ Políticas de prospectos actualizadas\n')
    
    // Verify the policies
    console.log('🧪 Verificando políticas...')
    const result = await pool.query(`
      SELECT schemaname, tablename, policyname 
      FROM pg_policies 
      WHERE tablename = 'prospectos' 
      ORDER BY policyname
    `)
    
    console.log('✅ Políticas activas en prospectos:')
    result.rows.forEach(row => {
      console.log(`   - ${row.policyname}`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

applyMigration()
