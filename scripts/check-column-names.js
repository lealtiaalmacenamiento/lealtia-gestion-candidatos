const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const dbUrl = process.env.DB_URL || process.env.DevDATABASE_URL || process.env.DATABASE_URL;
  
  const client = new Client({
    connectionString: dbUrl
  });

  try {
    await client.connect();
    console.log('Connected to database successfully\n');
    
    const tables = [
      'clientes',
      'poliza_puntos_cache',
      'historial_costos_poliza',
      'polizas',
      'user_segments'
    ];

    for (const table of tables) {
      console.log(`\n========== ${table.toUpperCase()} ==========`);
      const result = await client.query(`
        SELECT 
          column_name, 
          data_type, 
          udt_name,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      
      if (result.rows.length === 0) {
        console.log(`  ⚠️  Table not found or no columns`);
      } else {
        result.rows.forEach(row => {
          const nullable = row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
          const defaultVal = row.column_default ? ` DEFAULT ${row.column_default}` : '';
          console.log(`  ${row.column_name.padEnd(30)} ${row.data_type.padEnd(20)} ${nullable}${defaultVal}`);
        });
      }
    }

    // Check for foreign key relationships
    console.log(`\n\n========== FOREIGN KEY RELATIONSHIPS ==========`);
    const fkResult = await client.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name IN ('clientes', 'poliza_puntos_cache', 'historial_costos_poliza', 'polizas', 'user_segments')
      ORDER BY tc.table_name, kcu.column_name
    `);

    if (fkResult.rows.length === 0) {
      console.log('  No foreign keys found for these tables');
    } else {
      fkResult.rows.forEach(row => {
        console.log(`  ${row.table_name}.${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`);
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
