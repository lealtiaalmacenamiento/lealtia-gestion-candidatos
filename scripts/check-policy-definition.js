const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({ connectionString: process.env.DevDATABASE_URL });

  try {
    await client.connect();
    
    // Check a sample policy to see the actual SQL
    const result = await client.query(`
      SELECT tablename, policyname, qual, with_check
      FROM pg_policies
      WHERE tablename = 'tokens_integracion' 
        AND policyname = 'tokens_integracion_select_own'
    `);
    
    console.log('Policy definition:');
    console.log(JSON.stringify(result.rows[0], null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
