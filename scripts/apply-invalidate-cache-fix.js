#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

async function applyToAll() {
  const migrationPath = path.join(__dirname, '../supabase/migrations/20251211_fix_invalidate_cache_function.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')
  
  // DEV
  console.log('🔄 Aplicando a DEV...')
  const devPool = new Pool({ connectionString: process.env.DevDATABASE_URL })
  try {
    await devPool.query(sql)
    console.log('✅ DEV actualizado\n')
  } catch (e) {
    console.error('❌ DEV error:', e.message)
  } finally {
    await devPool.end()
  }
  
  // MAIN
  console.log('🔄 Aplicando a MAIN...')
  const mainPool = new Pool({ connectionString: process.env.MainDATABASE_URL })
  try {
    await mainPool.query(sql)
    console.log('✅ MAIN actualizado')
  } catch (e) {
    console.error('❌ MAIN error:', e.message)
  } finally {
    await mainPool.end()
  }
}

applyToAll()
