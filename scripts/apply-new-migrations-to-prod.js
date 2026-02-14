#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Aplica las nuevas migraciones a la BD de producción
 * Ejecutar: node scripts/apply-new-migrations-to-prod.js
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

async function applyMigration(pool, migrationFile, description) {
  const migrationPath = path.join(__dirname, '../supabase/migrations', migrationFile)
  const migrationSql = fs.readFileSync(migrationPath, 'utf8')
  
  console.log(`\n📝 Aplicando: ${description}`)
  console.log(`   Archivo: ${migrationFile}`)
  
  await pool.query(migrationSql)
  console.log('✅ Migración aplicada exitosamente')
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    console.log('🔄 Conectando a PRODUCCIÓN (MainDATABASE_URL)...\n')
    console.log('========================================')
    console.log('APLICANDO MIGRACIONES A PRODUCCIÓN')
    console.log('========================================')
    
    // Migración 1: Columna is_projection para UDI
    await applyMigration(
      pool,
      '20260207_add_udi_projection_column.sql',
      'Agregar columna is_projection a udi_values y fx_values'
    )
    
    // Migración 2: Tabla agent_codes (versión para producción)
    await applyMigration(
      pool,
      '20260209_create_agent_codes_prod.sql',
      'Crear tabla agent_codes para códigos de referido'
    )
    
    // Verificar ambas migraciones
    console.log('\n🧪 Verificando migraciones...')
    
    // Verificar columna is_projection
    const checkColumn = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'udi_values'
        AND column_name = 'is_projection'
    `)
    
    if (checkColumn.rows.length > 0) {
      console.log('✅ Columna is_projection verificada en udi_values')
    } else {
      console.error('❌ No se encontró la columna is_projection')
    }
    
    // Verificar tabla agent_codes
    const checkTable = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'agent_codes'
      ORDER BY ordinal_position
    `)
    
    if (checkTable.rows.length > 0) {
      console.log('✅ Tabla agent_codes verificada con columnas:')
      checkTable.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type}`)
      })
    } else {
      console.error('❌ No se encontró la tabla agent_codes')
    }
    
    // Verificar cantidad de códigos generados
    const countCodes = await pool.query('SELECT COUNT(*) as total FROM agent_codes')
    console.log(`\n📊 Códigos de agente generados: ${countCodes.rows[0].total}`)
    
    console.log('\n========================================')
    console.log('🎉 TODAS LAS MIGRACIONES COMPLETADAS')
    console.log('========================================')
    
  } catch (error) {
    console.error('\n❌ Error aplicando migraciones:')
    console.error(error.message)
    console.error('\nStack:', error.stack)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
