const {Pool}=require('pg');
require('dotenv').config({path:'.env.local'});
const p=new Pool({connectionString:process.env.MainDATABASE_URL});
p.query("SELECT table_name FROM information_schema.views WHERE table_schema='public' AND table_name='vw_cancelaciones_indices'")
  .then(r=>{console.log('MAIN tiene vw_cancelaciones_indices:',r.rows.length > 0);return p})
  .then(p=>{p.end();const p2=new Pool({connectionString:process.env.DevDATABASE_URL});return p2.query("SELECT table_name FROM information_schema.views WHERE table_schema='public' AND table_name='vw_cancelaciones_indices'").then(r=>{console.log('DEV tiene vw_cancelaciones_indices:',r.rows.length > 0);p2.end()})})
