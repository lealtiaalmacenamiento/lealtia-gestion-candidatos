#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const DATABASE_URL = process.env.DevDATABASE_URL

async function checkFunction() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    const result = await pool.query(`
      SELECT pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'invalidate_campaign_cache_for_user'
    `)
    
    if (result.rows.length === 0) {
      console.log('⚠️  Función invalidate_campaign_cache_for_user NO existe')
    } else {
      console.log('Definición de invalidate_campaign_cache_for_user:\n')
      console.log(result.rows[0].definition)
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await pool.end()
  }
}

checkFunction()
