#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

async function verify() {
  const pool = new Pool({ connectionString: process.env.DevDATABASE_URL })
  
  try {
    const result = await pool.query(`
      SELECT pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'recalc_puntos_poliza'
    `)
    
    const def = result.rows[0].definition
    
    // Buscar referencias sin public.
    const issues = []
    const tables = ['polizas', 'producto_parametros', 'product_types', 'poliza_puntos_cache']
    
    tables.forEach(table => {
      // Buscar patterns problemáticos: FROM/JOIN/UPDATE table sin public.
      const patterns = [
        new RegExp(`FROM\\s+${table}[\\s;)]`, 'i'),
        new RegExp(`JOIN\\s+${table}[\\s;)]`, 'i'),
        new RegExp(`UPDATE\\s+${table}[\\s;]`, 'i'),
        new RegExp(`INTO\\s+${table}[\\s;]`, 'i')
      ]
      
      patterns.forEach(p => {
        if (p.test(def) && !new RegExp(`public\\.${table}`).test(def)) {
          issues.push(`${table} sin public.`)
        }
      })
    })
    
    if (issues.length > 0) {
      console.log('❌ Problemas encontrados:')
      issues.forEach(i => console.log(`   - ${i}`))
      console.log('\n📄 Función completa:\n')
      console.log(def)
    } else {
      console.log('✅ Función recalc_puntos_poliza está correcta')
      console.log('\nReferencias públicas encontradas:')
      const matches = def.match(/public\.\w+/g) || []
      const unique = [...new Set(matches)]
      unique.forEach(m => console.log(`   - ${m}`))
    }
    
  } finally {
    await pool.end()
  }
}

verify()
