-- =====================================================
-- Migration: Fix trigger_invalidate_cache_on_polizas
-- Date: 2024-12-11
-- Description: Add explicit schema to usuarios and clientes
-- =====================================================

CREATE OR REPLACE FUNCTION public.trigger_invalidate_cache_on_polizas()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- Obtener usuario_id del asesor a través de clientes
  SELECT u.id INTO v_usuario_id
  FROM public.clientes c
  JOIN public.usuarios u ON u.id_auth = c.asesor_id
  WHERE c.id = COALESCE(NEW.cliente_id, OLD.cliente_id)
  LIMIT 1;

  IF v_usuario_id IS NOT NULL THEN
    PERFORM public.invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

COMMENT ON FUNCTION public.trigger_invalidate_cache_on_polizas() IS 'Invalida cache de campañas al cambiar pólizas con schema explícito';
