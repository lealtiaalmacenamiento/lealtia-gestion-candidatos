#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const DATABASE_URL = process.env.MainDATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ MainDATABASE_URL no encontrada en .env.local')
  process.exit(1)
}

async function checkDuplicateCodes() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  try {
    console.log('🔍 Buscando agentes con más de un código activo en main...\n')

    const { rows } = await pool.query(`
      SELECT
        ac.agente_id,
        u.nombre,
        u.email,
        COUNT(*) AS total_codigos_activos,
        array_agg(ac.code ORDER BY ac.created_at) AS codigos
      FROM agent_codes ac
      LEFT JOIN usuarios u ON u.id = ac.agente_id
      WHERE ac.activo = true
      GROUP BY ac.agente_id, u.nombre, u.email
      HAVING COUNT(*) > 1
      ORDER BY total_codigos_activos DESC
    `)

    if (rows.length === 0) {
      console.log('✅ Ningún agente tiene más de un código activo.')
    } else {
      console.log(`⚠️  ${rows.length} agente(s) con múltiples códigos activos:\n`)
      for (const row of rows) {
        console.log(`  Agente: ${row.nombre || '(sin nombre)'} <${row.email || '?'}>`)
        console.log(`  ID: ${row.agente_id} | Códigos activos (${row.total_codigos_activos}): ${row.codigos.join(', ')}`)
        console.log()
      }
    }
  } finally {
    await pool.end()
  }
}

checkDuplicateCodes().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
