/**
 * Script para verificar y copiar vw_cancelaciones_indices correctamente
 */

const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const MAIN_URL = process.env.MainDATABASE_URL
const DEV_URL = process.env.DevDATABASE_URL

async function main() {
  const mainPool = new Pool({ connectionString: MAIN_URL })
  const devPool = new Pool({ connectionString: DEV_URL })
  
  console.log('🔍 Investigando vw_cancelaciones_indices en MAIN\n')
  
  // Verificar si es una vista o tabla
  const check = await mainPool.query(`
    SELECT 
      c.relname,
      CASE c.relkind
        WHEN 'r' THEN 'TABLE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'i' THEN 'INDEX'
        WHEN 'S' THEN 'SEQUENCE'
      END as object_type
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'vw_cancelaciones_indices'
  `)
  
  if (check.rows.length === 0) {
    console.log('❌ No se encontró vw_cancelaciones_indices en MAIN')
    await mainPool.end()
    await devPool.end()
    return
  }
  
  const objectType = check.rows[0].object_type
  console.log(`📋 vw_cancelaciones_indices es: ${objectType}\n`)
  
  if (objectType === 'MATERIALIZED VIEW') {
    console.log('📦 Obteniendo definición de vista materializada...')
    
    const def = await mainPool.query(`
      SELECT pg_get_viewdef(c.oid, true) as definition
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND c.relname = 'vw_cancelaciones_indices'
    `)
    
    if (def.rows[0]) {
      const createSQL = `CREATE MATERIALIZED VIEW IF NOT EXISTS vw_cancelaciones_indices AS\n${def.rows[0].definition}`
      
      console.log('SQL a aplicar:')
      console.log('='.repeat(80))
      console.log(createSQL)
      console.log('='.repeat(80))
      
      console.log('\n📦 Aplicando a DEV...')
      try {
        await devPool.query(createSQL)
        console.log('✅ vw_cancelaciones_indices creada en DEV')
        
        // Crear índices si existen
        const indexes = await mainPool.query(`
          SELECT indexdef
          FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'vw_cancelaciones_indices'
        `)
        
        if (indexes.rows.length > 0) {
          console.log(`\n📋 Copiando ${indexes.rows.length} índices...`)
          for (const idx of indexes.rows) {
            try {
              await devPool.query(idx.indexdef)
              console.log(`✅ Índice aplicado`)
            } catch (err) {
              console.log(`⚠️  Error copiando índice: ${err.message}`)
            }
          }
        }
        
      } catch (err) {
        console.error('❌ Error:', err.message)
      }
    }
  } else if (objectType === 'VIEW') {
    const def = await mainPool.query(`
      SELECT pg_get_viewdef(c.oid, true) as definition
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND c.relname = 'vw_cancelaciones_indices'
    `)
    
    if (def.rows[0]) {
      const createSQL = `CREATE OR REPLACE VIEW vw_cancelaciones_indices AS\n${def.rows[0].definition}`
      console.log('\n📦 Aplicando vista a DEV...')
      try {
        await devPool.query(createSQL)
        console.log('✅ vw_cancelaciones_indices creada en DEV')
      } catch (err) {
        console.error('❌ Error:', err.message)
      }
    }
  }
  
  await mainPool.end()
  await devPool.end()
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  })
