require('dotenv').config({path:'.env.local'})
const {Pool}=require('pg')
const p=new Pool({connectionString:process.env.MainDATABASE_URL})

p.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_schema='public' AND table_name='candidatos' 
  ORDER BY ordinal_position
`).then(r=>{
  console.log('Columnas de candidatos en producción:')
  r.rows.forEach(c=>console.log(`  ${c.column_name}: ${c.data_type}`))
  p.end()
}).catch(e=>{console.error(e); p.end()})
