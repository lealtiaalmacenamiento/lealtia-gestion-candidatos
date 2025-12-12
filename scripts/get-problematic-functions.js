#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const DATABASE_URL = process.env.DevDATABASE_URL

async function getFunctionDefs() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
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
    
    for (const fname of functions) {
      const result = await pool.query(`
        SELECT pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = $1
        LIMIT 1
      `, [fname])
      
      if (result.rows.length > 0) {
        console.log(`\n-- ========== ${fname} ==========`)
        console.log(result.rows[0].definition)
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await pool.end()
  }
}

getFunctionDefs()
