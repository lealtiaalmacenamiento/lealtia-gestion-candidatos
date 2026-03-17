require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const client = new Client({ connectionString: process.env.MainDATABASE_URL });
const sql = fs.readFileSync('supabase/migrations/20260317_fix_top_asesores.sql', 'utf-8');
client.connect()
  .then(() => client.query(sql))
  .then(() => { console.log('✅ rpc_exec_top_asesores corregida'); })
  .then(() => client.query("NOTIFY pgrst, 'reload schema'"))
  .then(() => { console.log('✅ Schema cache recargado'); client.end(); process.exit(0); })
  .catch(e => { console.error('❌', e.message); client.end(); process.exit(1); });
