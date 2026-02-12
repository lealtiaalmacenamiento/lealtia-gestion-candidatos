const {Pool}=require('pg');
require('dotenv').config({path:'.env.local'});

async function main() {
  const mainPool = new Pool({connectionString:process.env.MainDATABASE_URL});
  const devPool = new Pool({connectionString:process.env.DevDATABASE_URL});
  
  console.log('📦 Extrayendo vw_cancelaciones_indices de MAIN...\n');
  
  const result = await mainPool.query(`
    SELECT view_definition 
    FROM information_schema.views 
    WHERE table_schema='public' AND table_name='vw_cancelaciones_indices'
  `);
  
  if (result.rows.length === 0) {
    console.log('❌ Vista no encontrada en MAIN');
    await mainPool.end();
    await devPool.end();
    return;
  }
  
  const viewDef = result.rows[0].view_definition;
  const createSQL = `CREATE OR REPLACE VIEW vw_cancelaciones_indices AS\n${viewDef}`;
  
  console.log('SQL a aplicar:');
  console.log('='.repeat(80));
  console.log(createSQL);
  console.log('='.repeat(80));
  
  console.log('\n📦 Aplicando a DEV...');
  try {
    await devPool.query(createSQL);
    console.log('✅ vw_cancelaciones_indices creada en DEV');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  await mainPool.end();
  await devPool.end();
}

main().catch(console.error);
