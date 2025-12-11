-- =====================================================
-- Migration: Fix invalidate_campaign_cache_for_user
-- Date: 2024-12-11
-- Description: Add explicit schema to campaign_progress
-- =====================================================

CREATE OR REPLACE FUNCTION public.invalidate_campaign_cache_for_user(p_usuario_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public.campaign_progress WHERE usuario_id = p_usuario_id;
END;
$function$;

COMMENT ON FUNCTION public.invalidate_campaign_cache_for_user(bigint) IS 'Invalida cache de campañas para un usuario con schema explícito';
