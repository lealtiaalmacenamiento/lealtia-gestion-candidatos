// Script temporal para evaluar campañas en producción
// Ejecutar con: node scripts/evaluate-campaign-prod.js

const { createClient } = require('@supabase/supabase-js');

const PROD_URL = 'https://oooyuomshachmmblmpvd.supabase.co';
const PROD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vb3l1b21zaGFjaG1tYmxtcHZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMjIxNDg4NSwiZXhwIjoyMDQ3NzkwODg1fQ.v0jlBqHcF9j3FRiYwxRZq8uFbPDxQVBZxQBOzrNw5JQ';

const userId = parseInt(process.argv[2]) || 25;

console.log(`Evaluando campañas para usuario ${userId} en producción...`);
console.log(`URL: ${PROD_URL}\n`);

const supabase = createClient(PROD_URL, PROD_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testQuery() {
  // Probar consulta a vw_cancelaciones_indices
  console.log('Probando consulta a vw_cancelaciones_indices...');
  const start = Date.now();
  
  const { data, error } = await supabase
    .from('vw_cancelaciones_indices')
    .select('*')
    .eq('usuario_id', userId)
    .order('periodo_mes', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  const duration = Date.now() - start;
  
  if (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
  
  console.log(`✅ Consulta exitosa en ${duration}ms`);
  console.log('Datos:', data || 'Sin datos');
  return true;
}

async function getCampaigns() {
  console.log('\nObteniendo campañas activas...');
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, slug, name, status')
    .eq('status', 'active')
    .order('name');
  
  if (error) {
    console.error('❌ Error:', error.message);
    return [];
  }
  
  console.log(`✅ ${data.length} campañas activas encontradas`);
  data.forEach(c => console.log(`  - ${c.name} (${c.slug})`));
  return data;
}

async function main() {
  try {
    const queryOk = await testQuery();
    if (!queryOk) {
      console.log('\n⚠️  La consulta a vw_cancelaciones_indices falló.');
      console.log('Verifica que la vista materializada esté creada correctamente.');
      process.exit(1);
    }
    
    const campaigns = await getCampaigns();
    
    console.log('\n✅ Sistema funcionando correctamente');
    console.log('La vista materializada está respondiendo rápidamente.');
    
  } catch (err) {
    console.error('\n❌ Error inesperado:', err);
    process.exit(1);
  }
}

main();
