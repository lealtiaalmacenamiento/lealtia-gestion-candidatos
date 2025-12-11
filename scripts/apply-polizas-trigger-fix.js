#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

async function apply() {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20251211_fix_polizas_trigger.sql'), 'utf8')
  
  console.log('🔄 Aplicando fix de trigger_invalidate_cache_on_polizas...\n')
  
  // DEV
  const devPool = new Pool({ connectionString: process.env.DevDATABASE_URL })
  try {
    await devPool.query(sql)
    console.log('✅ DEV actualizado')
  } finally {
    await devPool.end()
  }
  
  // MAIN
  const mainPool = new Pool({ connectionString: process.env.MainDATABASE_URL })
  try {
    await mainPool.query(sql)
    console.log('✅ MAIN actualizado')
  } finally {
    await mainPool.end()
  }
}

apply()
