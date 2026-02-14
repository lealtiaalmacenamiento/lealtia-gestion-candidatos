/**
 * Script para aplicar migraciones de puntos configurables (2026-01-22) a producción
 */

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const MAIN_DB_URL = process.env.MainDATABASE_URL

if (!MAIN_DB_URL) {
  console.error('❌ Falta MainDATABASE_URL en .env.local')
  process.exit(1)
}

const pool = new Pool({ connectionString: MAIN_DB_URL })

const migrations = [
  '20260122_add_puntos_thresholds.sql',
  '20260122_fix_puntos_encoding.sql',
  '20260122_update_recalc_puntos_poliza.sql'
]

async function applyMigration(filename) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`📄 Aplicando: ${filename}`)
  console.log('='.repeat(80))

  const filepath = path.join(__dirname, '..', 'supabase', 'migrations', filename)
  const sql = fs.readFileSync(filepath, 'utf8')

  try {
    await pool.query(sql)
    console.log(`✅ ${filename} aplicada exitosamente`)
  } catch (err) {
    console.error(`❌ Error aplicando ${filename}:`, err.message)
    throw err
  }
}

async function main() {
  console.log('🚀 APLICANDO MIGRACIONES A PRODUCCIÓN')
  console.log(`📍 Database: ${MAIN_DB_URL.replace(/:[^:]*@/, ':***@')}`)
  console.log(`📅 Fecha: ${new Date().toISOString()}`)
  
  for (const migration of migrations) {
    await applyMigration(migration)
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ TODAS LAS MIGRACIONES APLICADAS EXITOSAMENTE')
  console.log('='.repeat(80))
  
  // Verificar que la tabla puntos_thresholds existe y tiene datos
  const result = await pool.query(`
    SELECT * FROM puntos_thresholds
    ORDER BY tipo_producto, orden
  `)
  
  console.log(`\n✅ Tabla puntos_thresholds creada con ${result.rows.length} registros:`)
  result.rows.forEach(t => {
    console.log(`   ${t.tipo_producto}: ${t.umbral_min} - ${t.umbral_max || '∞'} → ${t.puntos} puntos (${t.clasificacion})`)
  })
  
  await pool.end()
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  })
