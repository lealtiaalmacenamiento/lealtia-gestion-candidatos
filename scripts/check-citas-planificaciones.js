const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const dbUrl = process.env.DB_URL || process.env.DevDATABASE_URL || process.env.DATABASE_URL;
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    
    const tables = ['citas', 'planificaciones'];
    
    for (const table of tables) {
      console.log(`\n=== ${table} ===`);
      const result = await client.query(`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_name = $1
          AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [table]);
      
      result.rows.forEach(row => {
        console.log(`  ${row.column_name}: ${row.data_type} (${row.udt_name})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
