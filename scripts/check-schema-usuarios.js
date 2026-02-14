#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Verifica estructura de tablas y políticas RLS
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const DATABASE_URL = process.env.DevDATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ DevDATABASE_URL no encontrada')
  process.exit(1)
}

async function checkSchema() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    console.log('🔍 Verificando estructura de tabla usuarios...\n')
    
    // Estructura de usuarios
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usuarios'
      ORDER BY ordinal_position
    `)
    
    console.log('📋 Columnas de tabla usuarios:')
    columns.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : ''}`)
    })
    
    console.log('\n🔐 Políticas RLS de tabla usuarios:')
    const policies = await pool.query(`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'usuarios'
    `)
    
    if (policies.rows.length > 0) {
      policies.rows.forEach(p => {
        console.log(`\n   Política: ${p.policyname}`)
        console.log(`   Comando: ${p.cmd}`)
        console.log(`   USING: ${p.qual || 'N/A'}`)
      })
    } else {
      console.log('   No hay políticas RLS configuradas')
    }
    
    console.log('\n\n🔍 Verificando tabla prospectos...\n')
    
    const prospectosColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'prospectos'
      ORDER BY ordinal_position
    `)
    
    console.log('📋 Columnas de tabla prospectos:')
    prospectosColumns.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : ''}`)
    })
    
    console.log('\n🔐 Políticas RLS de tabla prospectos (muestra):')
    const prospectosPolicies = await pool.query(`
      SELECT policyname, cmd, qual
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'prospectos'
      LIMIT 3
    `)
    
    prospectosPolicies.rows.forEach(p => {
      console.log(`\n   Política: ${p.policyname}`)
      console.log(`   Comando: ${p.cmd}`)
      console.log(`   USING: ${p.qual?.substring(0, 100)}...`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await pool.end()
  }
}

checkSchema()
