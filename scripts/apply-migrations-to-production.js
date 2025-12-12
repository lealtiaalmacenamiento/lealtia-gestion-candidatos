const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function applyMigrationToProduction(migrationFile) {
  const dbUrl = process.env.MainDATABASE_URL; // Production DB
  
  if (!dbUrl) {
    console.error('ERROR: MainDATABASE_URL not found in .env.local');
    process.exit(1);
  }
  
  const client = new Client({ connectionString: dbUrl });
  
  try {
    await client.connect();
    console.log(`Connected to PRODUCTION database`);
    console.log(`Applying migration: ${migrationFile}\n`);
    
    const sql = fs.readFileSync(migrationFile, 'utf-8');
    await client.query(sql);
    
    console.log('✅ Migration applied successfully to PRODUCTION');
  } catch (error) {
    console.error('❌ Failed to execute SQL:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Apply all three migrations in order
async function applyAllMigrations() {
  const migrations = [
    'supabase/migrations/20251210_enable_rls_missing_tables.sql',
    'supabase/migrations/20251210_fix_remaining_security_issues.sql',
    'supabase/migrations/20251210_optimize_performance_security.sql',
    'supabase/migrations/20251210_fix_function_search_path.sql'
  ];
  
  console.log('========================================');
  console.log('APPLYING MIGRATIONS TO PRODUCTION');
  console.log('========================================\n');
  
  for (const migration of migrations) {
    await applyMigrationToProduction(migration);
    console.log('');
  }
  
  console.log('========================================');
  console.log('ALL MIGRATIONS COMPLETED SUCCESSFULLY');
  console.log('========================================');
}

applyAllMigrations();
