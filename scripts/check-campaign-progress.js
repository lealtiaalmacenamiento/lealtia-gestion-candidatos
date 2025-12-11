#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const DATABASE_URL = process.env.DevDATABASE_URL

async function checkTable() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    // Check if campaign_progress table exists
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'campaign_progress'
      ) as exists
    `)
    
    console.log('campaign_progress existe:', result.rows[0].exists)
    
    if (!result.rows[0].exists) {
      console.log('\n⚠️  La tabla campaign_progress NO existe en DEV')
      console.log('Buscando en migraciones...\n')
      
      // Check what tables do exist related to campaigns
      const tables = await pool.query(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE '%campaign%'
        ORDER BY tablename
      `)
      
      console.log('Tablas relacionadas con campaign:')
      tables.rows.forEach(row => console.log(`  - ${row.tablename}`))
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await pool.end()
  }
}

checkTable()
