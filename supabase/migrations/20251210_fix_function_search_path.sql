-- =====================================================
-- Migration: Fix Function Search Path Security Warnings
-- Date: 2024-12-10
-- Description: Add SET search_path to all functions to prevent
--              search_path hijacking attacks
-- =====================================================

-- All functions with correct signatures
ALTER FUNCTION public.transfer_reassign_usuario(p_old_id bigint, p_new_id bigint, p_actor_email text) SET search_path = '';
ALTER FUNCTION public.generar_cliente_code() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.producto_parametros_set_keys() SET search_path = '';
ALTER FUNCTION public.producto_parametros_after_update_sync_moneda() SET search_path = '';
ALTER FUNCTION public.polizas_before_insupd_enforce_moneda() SET search_path = '';
ALTER FUNCTION public.get_current_udi(p_fecha date) SET search_path = '';
ALTER FUNCTION public.get_fx_usd(p_fecha date) SET search_path = '';
ALTER FUNCTION public.normalize_prima(p_monto numeric, p_moneda moneda_poliza, p_fecha date) SET search_path = '';
ALTER FUNCTION public.polizas_normalize_amounts() SET search_path = '';
ALTER FUNCTION public.poliza_year_vigencia(p_fecha_emision date) SET search_path = '';
ALTER FUNCTION public.polizas_after_change_recalc() SET search_path = '';
ALTER FUNCTION public.recalc_puntos_poliza(p_poliza_id uuid) SET search_path = '';
ALTER FUNCTION public.recalc_puntos_poliza_all(p_limit integer) SET search_path = '';
ALTER FUNCTION public.submit_cliente_update(p_cliente_id uuid, p_payload jsonb) SET search_path = '';
ALTER FUNCTION public.apply_cliente_update(p_request_id uuid) SET search_path = '';
ALTER FUNCTION public.reject_cliente_update(p_request_id uuid, p_motivo text) SET search_path = '';
ALTER FUNCTION public.jwt_role() SET search_path = '';
ALTER FUNCTION public.refresh_vw_cancelaciones_indices() SET search_path = '';
ALTER FUNCTION public.calculate_campaign_datasets_for_user(p_usuario_id bigint) SET search_path = '';
ALTER FUNCTION public.invalidate_campaign_cache_for_user(p_usuario_id bigint) SET search_path = '';
ALTER FUNCTION public.trigger_invalidate_cache_on_candidatos() SET search_path = '';
ALTER FUNCTION public.trigger_invalidate_cache_on_clientes() SET search_path = '';
ALTER FUNCTION public.submit_poliza_update(p_poliza_id uuid, p_payload jsonb) SET search_path = '';
ALTER FUNCTION public.trigger_invalidate_cache_on_prospectos() SET search_path = '';
ALTER FUNCTION public.reject_poliza_update(p_request_id uuid, p_motivo text) SET search_path = '';
ALTER FUNCTION public.trigger_invalidate_cache_on_planificaciones() SET search_path = '';
ALTER FUNCTION public.trigger_invalidate_cache_on_custom_metrics() SET search_path = '';
ALTER FUNCTION public.trigger_invalidate_cache_on_user_segments() SET search_path = '';
ALTER FUNCTION public.trigger_invalidate_cache_on_polizas() SET search_path = '';
ALTER FUNCTION public.recalc_polizas_by_producto_parametro(p_pp_id uuid) SET search_path = '';
ALTER FUNCTION public.apply_poliza_update(p_request_id uuid) SET search_path = '';
ALTER FUNCTION public.evaluate_all_campaigns() SET search_path = '';
-- ALTER FUNCTION public.apply_poliza_update_dbg(p_request_id uuid) SET search_path = ''; -- Debug function, may not exist in prod
ALTER FUNCTION public.producto_parametros_after_update_recalc() SET search_path = '';

-- =====================================================
-- Performance optimizations: Add missing FK indexes
-- =====================================================

-- campaign_progress.usuario_id (bigint FK to usuarios.id)
CREATE INDEX IF NOT EXISTS idx_campaign_progress_usuario_id 
  ON public.campaign_progress(usuario_id);

-- campaign_segments.segment_id (bigint FK to segments.id)
CREATE INDEX IF NOT EXISTS idx_campaign_segments_segment_id 
  ON public.campaign_segments(segment_id);

-- candidatos foreign keys
CREATE INDEX IF NOT EXISTS idx_candidatos_efc 
  ON public.candidatos(efc);

CREATE INDEX IF NOT EXISTS idx_candidatos_mes 
  ON public.candidatos(mes);

-- user_segments.segment_id (bigint FK to segments.id)
CREATE INDEX IF NOT EXISTS idx_user_segments_segment_id 
  ON public.user_segments(segment_id);

-- =====================================================
-- END OF MIGRATION
-- =====================================================
