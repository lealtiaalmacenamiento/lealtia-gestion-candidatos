#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const devClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkTypes() {
  console.log('\n🔍 Verificando tipos custom...\n')
  
  const { data, error } = await devClient.rpc('exec_sql', {
    sql_query: `
      SELECT typname, nspname 
      FROM pg_type t 
      JOIN pg_namespace n ON t.typnamespace = n.oid 
      WHERE typname LIKE '%moneda%' OR typname LIKE '%estatus%'
      ORDER BY nspname, typname;
    `
  })
  
  if (error) {
    console.error('❌ Error:', error.message)
    return
  }
  
  console.log('Tipos encontrados:')
  data?.forEach(row => {
    console.log(`  ${row.nspname}.${row.typname}`)
  })
}

checkTypes()
