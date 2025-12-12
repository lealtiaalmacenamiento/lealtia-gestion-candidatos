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
  'recalc_puntos_poliza_all'
]

async function generateMigration() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    let migration = `-- =====================================================
-- Migration: Fix remaining 8 poliza/cliente functions
-- Date: 2024-12-11
-- Description: Add explicit public. schema to all table references
-- =====================================================

`
    
    for (const fname of functions) {
      console.log(`Obteniendo ${fname}...`)
      
      const result = await pool.query(`
        SELECT pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = $1
        LIMIT 1
      `, [fname])
      
      if (result.rows.length === 0) {
        console.log(`  ⚠️  No encontrada`)
        continue
      }
      
      let def = result.rows[0].definition
      
      // Reemplazar todas las referencias de tablas sin public.
      // Importante: manejar %ROWTYPE también
      const replacements = [
        // %ROWTYPE declarations
        [/\b(clientes)%ROWTYPE/gi, 'public.$1%ROWTYPE'],
        [/\b(polizas)%ROWTYPE/gi, 'public.$1%ROWTYPE'],
        [/\b(producto_parametros)%ROWTYPE/gi, 'public.$1%ROWTYPE'],
        [/\b(cliente_update_requests)%ROWTYPE/gi, 'public.$1%ROWTYPE'],
        [/\b(poliza_update_requests)%ROWTYPE/gi, 'public.$1%ROWTYPE'],
        
        // Table references in queries (solo si no tienen public.)
        [/\bFROM\s+(clientes|polizas|producto_parametros|product_types|poliza_puntos_cache|cliente_historial|historial_costos_poliza|cliente_update_requests|poliza_update_requests)\b(?!\.)/gi, 'FROM public.$1'],
        [/\bJOIN\s+(clientes|polizas|producto_parametros|product_types|poliza_puntos_cache|cliente_historial|historial_costos_poliza|cliente_update_requests|poliza_update_requests)\b(?!\.)/gi, 'JOIN public.$1'],
        [/\bUPDATE\s+(clientes|polizas|producto_parametros|product_types|poliza_puntos_cache|cliente_historial|historial_costos_poliza|cliente_update_requests|poliza_update_requests)\b(?!\.)/gi, 'UPDATE public.$1'],
        [/\bINTO\s+(clientes|polizas|producto_parametros|product_types|poliza_puntos_cache|cliente_historial|historial_costos_poliza|cliente_update_requests|poliza_update_requests)\b(?!\.)/gi, 'INTO public.$1'],
        
        // INSERT INTO
        [/\bINSERT\s+INTO\s+(clientes|polizas|producto_parametros|product_types|poliza_puntos_cache|cliente_historial|historial_costos_poliza|cliente_update_requests|poliza_update_requests)\b(?!\.)/gi, 'INSERT INTO public.$1'],
        
        // Function calls (solo si no tienen public.)
        [/\bis_super_role\(\)/g, 'public.is_super_role()'],
        [/\brecalc_puntos_poliza\(/g, 'public.recalc_puntos_poliza(']
      ]
      
      replacements.forEach(([pattern, replacement]) => {
        def = def.replace(pattern, replacement)
      })
      
      migration += `-- ${fname}\n`
      migration += def + ';\n\n'
    }
    
    migration += `COMMENT ON FUNCTION public.apply_cliente_update(uuid) IS 'Aplica actualización de cliente con schema explícito';
COMMENT ON FUNCTION public.apply_poliza_update(uuid) IS 'Aplica actualización de póliza con schema explícito';
COMMENT ON FUNCTION public.recalc_puntos_poliza(uuid) IS 'Recalcula puntos de póliza con schema explícito';
`
    
    const outputPath = 'supabase/migrations/20251211_fix_8_remaining_functions.sql'
    fs.writeFileSync(outputPath, migration, 'utf8')
    console.log(`\n✅ Migración generada: ${outputPath}`)
    console.log(`📊 Total funciones: ${functions.length}`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

generateMigration()
