#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const DATABASE_URL = process.env.DevDATABASE_URL

async function findAllIssues() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    console.log('🔍 Buscando TODAS las funciones con search_path vacío...\n')
    
    // Get all functions with SET search_path = ''
    const functionsResult = await pool.query(`
      SELECT 
        p.proname as function_name,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
        AND pg_get_functiondef(p.oid) LIKE '%SET search_path%'
      ORDER BY p.proname
    `)
    
    console.log(`📊 Encontradas ${functionsResult.rows.length} funciones con search_path configurado\n`)
    
    const problematic = []
    const safe = []
    
    // Common table names to check
    const tables = [
      'usuarios', 'candidatos', 'prospectos', 'planificaciones', 'clientes', 
      'polizas', 'citas', 'agente_meta', 'campaign_progress', 'campaigns',
      'producto_parametros', 'product_types', 'cedula_a1', 'efc',
      'cliente_historial', 'poliza_puntos_cache', 'tokens_integracion',
      'logs_integracion', 'prospectos_historial'
    ]
    
    functionsResult.rows.forEach(row => {
      const def = row.definition
      const hasEmptySearchPath = def.includes("SET search_path TO ''") || def.includes("SET search_path = ''")
      
      if (!hasEmptySearchPath) {
        return
      }
      
      // Check for table references without public. schema
      const issues = []
      tables.forEach(table => {
        // Patterns that indicate table usage without schema
        const patterns = [
          new RegExp(`FROM\\s+${table}\\s`, 'i'),
          new RegExp(`JOIN\\s+${table}\\s`, 'i'),
          new RegExp(`UPDATE\\s+${table}\\s`, 'i'),
          new RegExp(`INSERT\\s+INTO\\s+${table}\\s`, 'i'),
          new RegExp(`DELETE\\s+FROM\\s+${table}\\s`, 'i')
        ]
        
        const hasPublicSchema = new RegExp(`public\\.${table}`, 'i').test(def)
        const hasTableRef = patterns.some(p => p.test(def))
        
        if (hasTableRef && !hasPublicSchema) {
          issues.push(table)
        }
      })
      
      if (issues.length > 0) {
        problematic.push({ name: row.function_name, tables: issues })
      } else {
        safe.push(row.function_name)
      }
    })
    
    if (problematic.length > 0) {
      console.log('⚠️  FUNCIONES PROBLEMÁTICAS:\n')
      problematic.forEach(fn => {
        console.log(`❌ ${fn.name}`)
        console.log(`   Tablas sin schema: ${fn.tables.join(', ')}\n`)
      })
    } else {
      console.log('✅ No se encontraron funciones problemáticas\n')
    }
    
    console.log(`✅ Funciones correctas: ${safe.length}`)
    if (safe.length > 0 && safe.length <= 10) {
      safe.forEach(name => console.log(`   - ${name}`))
    }
    
    // Also check triggers
    console.log('\n🔍 Verificando triggers...\n')
    const triggersResult = await pool.query(`
      SELECT 
        tgname as trigger_name,
        pg_get_triggerdef(oid) as definition
      FROM pg_trigger
      WHERE NOT tgisinternal
      ORDER BY tgname
    `)
    
    console.log(`📊 Encontrados ${triggersResult.rows.length} triggers personalizados`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

findAllIssues()
