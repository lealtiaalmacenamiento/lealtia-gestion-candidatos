require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.MainDATABASE_URL });
client.connect()
  .then(() => client.query("NOTIFY pgrst, 'reload schema'"))
  .then(() => { console.log('✅ Schema cache de PostgREST recargado'); client.end(); process.exit(0); })
  .catch(e => { console.error('❌', e.message); client.end(); process.exit(1); });
