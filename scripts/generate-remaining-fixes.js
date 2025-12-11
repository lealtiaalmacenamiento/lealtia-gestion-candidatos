#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const fs = require('fs')

const DATABASE_URL = process.env.DevDATABASE_URL

const functions = [
  'apply_cliente_update',
  'apply_poliza_update',
  'apply_poliza_update_dbg',
  'polizas_before_insupd_enforce_moneda',
  'producto_parametros_after_update_sync_moneda',
  'recalc_polizas_by_producto_parametro',
  'recalc_puntos_poliza',
  'recalc_puntos_poliza_all',
  'trigger_invalidate_cache_on_polizas'
]

const tables = [
  'usuarios', 'candidatos', 'prospectos', 'planificaciones', 'clientes',
  'polizas', 'citas', 'agente_meta', 'campaign_progress', 'campaigns',
  'producto_parametros', 'product_types', 'cedula_a1', 'efc',
  'cliente_historial', 'poliza_puntos_cache', 'cliente_update_requests',
  'poliza_update_requests', 'historial_costos_poliza'
]

async function generateMigration() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    let migration = `-- =====================================================
-- Migration: Fix remaining 9 functions with table references
-- Date: 2024-12-11
-- Description: Add explicit public. schema to all table references
-- =====================================================

`
    
    for (const fname of functions) {
      console.log(`Procesando ${fname}...`)
      
      const result = await pool.query(`
        SELECT pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = $1
        LIMIT 1
      `, [fname])
      
      if (result.rows.length === 0) {
        console.log(`  ⚠️  No encontrada, saltando...`)
        continue
      }
      
      let def = result.rows[0].definition
      
      // Replace table references with public. schema
      // Must preserve already qualified references and %ROWTYPE declarations
      tables.forEach(table => {
        // Only replace if not already qualified with public.
        // DON'T replace in %ROWTYPE declarations
        // Patterns: FROM table, JOIN table, UPDATE table, INSERT INTO table, DELETE FROM table
        def = def.replace(new RegExp(`\\b(FROM|JOIN|UPDATE|INTO)\\s+(${table})\\s`, 'gi'), `$1 public.$2 `)
        def = def.replace(new RegExp(`\\b(FROM|JOIN|UPDATE|INTO)\\s+(${table})([;\\)])`, 'gi'), `$1 public.$2$3`)
      })
      
      migration += `-- Fix ${fname}\n`
      migration += def + ';\n\n'
    }
    
    migration += `COMMENT ON FUNCTION public.apply_cliente_update(uuid) IS 'Aplica actualización de cliente con schema explícito';
COMMENT ON FUNCTION public.recalc_puntos_poliza(uuid) IS 'Recalcula puntos de póliza con schema explícito';
`
    
    fs.writeFileSync('supabase/migrations/20251211_fix_remaining_9_functions.sql', migration, 'utf8')
    console.log('\n✅ Migración generada: supabase/migrations/20251211_fix_remaining_9_functions.sql')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

generateMigration()
