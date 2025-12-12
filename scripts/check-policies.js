const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({ connectionString: process.env.DB_URL });

  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT tablename, policyname, qual, with_check
      FROM pg_policies
      WHERE tablename IN ('citas', 'planificaciones')
      ORDER BY tablename, policyname
    `);
    
    result.rows.forEach(p => {
      console.log(`${p.tablename}.${p.policyname}:`);
      console.log(`  USING: ${p.qual}`);
      console.log(`  CHECK: ${p.with_check}\n`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
