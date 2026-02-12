#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Aplica migración de tabla agent_codes a BD DEV
 * Ejecutar: node scripts/apply-agent-codes-migration.js
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
    
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260209_create_agent_codes.sql')
    const migrationSql = fs.readFileSync(migrationPath, 'utf8')
    
    console.log('📝 Ejecutando migración de tabla agent_codes...')
    await pool.query(migrationSql)
    console.log('✅ Tabla agent_codes creada exitosamente\n')
    
    // Verificar que la tabla existe
    console.log('🧪 Verificando tabla agent_codes...')
    const result = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'agent_codes'
      ORDER BY ordinal_position
    `)
    
    if (result.rows.length > 0) {
      console.log('✅ Tabla agent_codes verificada:')
      result.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type}`)
      })
    } else {
      console.error('❌ No se encontró la tabla agent_codes')
    }
    
    console.log('\n🎉 Migración completada exitosamente')
    
  } catch (error) {
    console.error('❌ Error aplicando migración:')
    console.error(error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

applyMigration()
