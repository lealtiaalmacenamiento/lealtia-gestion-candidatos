#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.MainDATABASE_URL })
pool.query(
  "UPDATE agent_codes SET activo = false WHERE code = $1 AND agente_id = $2",
  ['AE2059', 25]
).then(r => {
  console.log(`✅ Código AE2059 desactivado. Filas afectadas: ${r.rowCount}`)
  pool.end()
}).catch(e => {
  console.error('❌', e.message)
  pool.end()
  process.exit(1)
})
