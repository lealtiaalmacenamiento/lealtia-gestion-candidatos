const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({ connectionString: process.env.DevDATABASE_URL });

  try {
    await client.connect();
    
    const functions = [
      'transfer_reassign_usuario',
      'generar_cliente_code',
      'set_updated_at',
      'producto_parametros_set_keys',
      'producto_parametros_after_update_sync_moneda',
      'polizas_before_insupd_enforce_moneda',
      'get_current_udi',
      'get_fx_usd',
      'normalize_prima',
      'polizas_normalize_amounts',
      'poliza_year_vigencia',
      'polizas_after_change_recalc',
      'recalc_puntos_poliza',
      'recalc_puntos_poliza_all',
      'submit_cliente_update',
      'apply_cliente_update',
      'reject_cliente_update',
      'jwt_role',
      'refresh_vw_cancelaciones_indices',
      'calculate_campaign_datasets_for_user',
      'invalidate_campaign_cache_for_user',
      'trigger_invalidate_cache_on_candidatos',
      'trigger_invalidate_cache_on_clientes',
      'submit_poliza_update',
      'trigger_invalidate_cache_on_prospectos',
      'reject_poliza_update',
      'trigger_invalidate_cache_on_planificaciones',
      'trigger_invalidate_cache_on_custom_metrics',
      'trigger_invalidate_cache_on_user_segments',
      'trigger_invalidate_cache_on_polizas',
      'recalc_polizas_by_producto_parametro',
      'apply_poliza_update',
      'evaluate_all_campaigns',
      'apply_poliza_update_dbg',
      'producto_parametros_after_update_recalc'
    ];
    
    console.log('-- Function signatures for ALTER FUNCTION statements\n');
    
    for (const funcName of functions) {
      const result = await client.query(`
        SELECT 
          p.proname,
          pg_get_function_arguments(p.oid) as args,
          pg_get_function_identity_arguments(p.oid) as identity_args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = $1
      `, [funcName]);
      
      if (result.rows.length > 0) {
        const func = result.rows[0];
        const args = func.identity_args || '';
        console.log(`ALTER FUNCTION public.${func.proname}(${args}) SET search_path = '';`);
      } else {
        console.log(`-- WARNING: Function ${funcName} not found`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
