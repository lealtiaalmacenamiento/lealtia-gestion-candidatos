require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.MainDATABASE_URL });
client.connect()
  .then(() => client.query("DROP FUNCTION IF EXISTS public.rpc_exec_funnel(uuid)"))
  .then(() => { console.log('✅ Overload rpc_exec_funnel(uuid) eliminado'); })
  .then(() => client.query("NOTIFY pgrst, 'reload schema'"))
  .then(() => { console.log('✅ Schema cache recargado'); client.end(); process.exit(0); })
  .catch(e => { console.error('❌', e.message); client.end(); process.exit(1); });
