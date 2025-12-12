require('dotenv').config({ path: '.env.local' });

const keys = Object.keys(process.env).filter(k => 
  k.includes('DATABASE') || 
  k.includes('DB') || 
  k.includes('MAIN') || 
  k.includes('PROD')
);

console.log('Environment variables related to database:');
keys.forEach(k => console.log(`  - ${k}`));

if (keys.length === 0) {
  console.log('  (none found)');
}
