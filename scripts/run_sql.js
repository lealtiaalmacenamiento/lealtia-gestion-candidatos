#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const filePath = process.argv[2];
  const dbUrl = process.env.DB_URL;

  if (!filePath) {
    console.error('Usage: node scripts/run_sql.js <path-to-sql-file>');
    process.exit(1);
  }
  if (!dbUrl) {
    console.error('Set DB_URL environment variable with the connection string.');
    process.exit(1);
  }

  const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const sql = fs.readFileSync(absolute, 'utf8');

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    await client.query(sql);
    console.log('SQL executed successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Failed to execute SQL:', err);
  process.exit(1);
});
