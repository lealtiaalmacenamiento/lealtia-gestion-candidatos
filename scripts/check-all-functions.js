#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Lista todas las funciones que referencian 'usuarios' sin public.
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const DATABASE_URL = process.env.DevDATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ DevDATABASE_URL no encontrada')
  process.exit(1)
}

async function checkFunctions() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    console.log('🔍 Buscando funciones que referencian "usuarios" sin schema...\n')
    
    const result = await pool.query(`
      SELECT 
        p.proname as function_name,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
        AND pg_get_functiondef(p.oid) ILIKE '%FROM usuarios%'
      ORDER BY p.proname
    `)
    
    if (result.rows.length === 0) {
      console.log('✅ No se encontraron funciones problemáticas')
      return
    }
    
    console.log(`⚠️  Encontradas ${result.rows.length} funciones:\n`)
    
    result.rows.forEach(row => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`Función: ${row.function_name}`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(row.definition)
      console.log('\n')
    })
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

checkFunctions()
