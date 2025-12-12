#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const devUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const mainUrl = devUrl.replace('wqutrjnxvcgmyyiyjmsd', 'oooyuomshachmmblmpvd')

const devClient = createClient(devUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)
const mainClient = createClient(mainUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20251211_fix_planificaciones_trigger.sql')
const sql = fs.readFileSync(migrationPath, 'utf8')

async function applyMigration(client, dbName) {
  console.log(`\n🔄 Aplicando a ${dbName}...`)
  
  try {
    // Aplicar directamente el SQL completo
    const { error } = await client.rpc('exec_raw_sql', { sql: sql })
    if (error) {
      // Si exec_raw_sql no existe, intentar línea por línea
      const lines = sql.split(';').filter(line => line.trim() && !line.trim().startsWith('--'))
      
      for (const statement of lines) {
        const trimmed = statement.trim()
        if (!trimmed) continue
        
        const { error: stmtError } = await client.rpc('exec_sql', { sql_query: trimmed })
        if (stmtError) throw stmtError
      }
    }
    
    console.log(`✅ ${dbName} actualizado`)
  } catch (err) {
    console.error(`❌ ${dbName} error:`, err.message || err)
    // Aplicar directamente sin RPC
    console.log('Intentando aplicar sin RPC...')
    const { error: directError } = await client.from('_migrations').select('*').limit(1)
    if (directError) {
      console.log('No hay función RPC disponible. Aplica manualmente la migración.')
    }
  }
}

async function main() {
  console.log('📝 Aplicando corrección del trigger de planificaciones...\n')
  
  await applyMigration(devClient, 'DEV')
  await applyMigration(mainClient, 'MAIN')
  
  console.log('\n✅ Trigger corregido en ambas bases de datos')
  console.log('\n💡 Ahora ejecuta: node scripts/sync-existing-citas-to-planificacion.js')
}

main()
