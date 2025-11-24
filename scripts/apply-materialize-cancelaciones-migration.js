#!/usr/bin/env node

/**
 * Script para aplicar la migración que materializa vw_cancelaciones_indices
 * 
 * Uso:
 *   node scripts/apply-materialize-cancelaciones-migration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wqutrjnxvcgmyyiyjmsd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY no configurado');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('📦 Aplicando migración para materializar vw_cancelaciones_indices...');
  
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20251124_materialize_cancelaciones_indices.sql');
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ No se encontró el archivo de migración: ${migrationPath}`);
    process.exit(1);
  }
  
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log('🚀 Ejecutando migración...');
  console.log('⚠️  Advertencia: Esta operación puede tardar varios minutos en completarse.');
  console.log('');
  
  try {
    // Nota: Supabase client no soporta múltiples statements directamente
    // Necesitamos usar la REST API directamente o ejecutar via psql
    const { data, error } = await supabase.rpc('exec', { sql_query: sql });
    
    if (error) {
      console.error('❌ Error ejecutando migración:', error.message);
      console.log('');
      console.log('💡 Solución alternativa: Ejecutar manualmente en el SQL Editor de Supabase Dashboard');
      console.log('   URL: https://supabase.com/dashboard/project/wqutrjnxvcgmyyiyjmsd/sql');
      console.log('');
      console.log('O usar el comando psql:');
      console.log(`   psql -h db.wqutrjnxvcgmyyiyjmsd.supabase.co -U postgres -d postgres -f "${migrationPath}"`);
      process.exit(1);
    }
    
    console.log('✅ Migración aplicada exitosamente');
    console.log('');
    console.log('Cambios realizados:');
    console.log('  ✓ vw_cancelaciones_indices convertida a vista materializada');
    console.log('  ✓ Índices creados en usuario_id, periodo_mes');
    console.log('  ✓ Función refresh_vw_cancelaciones_indices() creada');
    console.log('');
    console.log('⚠️  IMPORTANTE: Configurar pg_cron para refrescar la vista cada 10 minutos:');
    console.log('   SELECT cron.schedule(');
    console.log("     'refresh-cancelaciones-indices',");
    console.log("     '*/10 * * * *',");
    console.log('     $$SELECT refresh_vw_cancelaciones_indices();$$');
    console.log('   );');
    
  } catch (err) {
    console.error('❌ Error inesperado:', err);
    process.exit(1);
  }
}

applyMigration().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
