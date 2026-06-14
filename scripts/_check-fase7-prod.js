require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.MainDATABASE_URL });
  await client.connect();
  console.log('Connected to PROD\n');

  // 1. SP tables
  const { rows: spTables } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'sp_%' ORDER BY table_name"
  );
  console.log('SP tables in PROD:', spTables.length ? spTables.map(r => r.table_name).join(', ') : 'NONE');

  // 2. tokens_integracion.meta column
  const { rows: metaCol } = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='tokens_integracion' AND column_name='meta'"
  );
  console.log('tokens_integracion.meta column:', metaCol.length ? 'EXISTS' : 'MISSING');

  // 3. Check proveedor constraint covers calcom/sendpilot
  const { rows: checks } = await client.query(
    "SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname='tokens_integracion' AND c.contype='c' AND c.conname='tokens_integracion_proveedor_check'"
  );
  console.log('proveedor check constraint:', checks.length ? checks[0].def : 'NOT FOUND');

  // 4. sp_precandidatos columns (if table exists)
  const { rows: spCols } = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='sp_precandidatos' ORDER BY ordinal_position"
  );
  if (spCols.length) {
    console.log('\nsp_precandidatos columns:', spCols.map(r => r.column_name).join(', '));
  }

  // 5. sp_campanas columns
  const { rows: campanasCols } = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='sp_campanas' ORDER BY ordinal_position"
  );
  if (campanasCols.length) {
    console.log('sp_campanas columns:', campanasCols.map(r => r.column_name).join(', '));
  }

  await client.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
