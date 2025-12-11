-- =====================================================
-- Migration: Fix trigger_invalidate_cache_on_planificaciones
-- Date: 2024-12-11
-- Description: Add public. schema to function call
-- =====================================================

CREATE OR REPLACE FUNCTION public.trigger_invalidate_cache_on_planificaciones()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- agente_id en planificaciones es directamente el usuario_id
  v_usuario_id := COALESCE(NEW.agente_id, OLD.agente_id);
  
  IF v_usuario_id IS NOT NULL THEN
    PERFORM public.invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.trigger_invalidate_cache_on_planificaciones() IS 'Trigger para invalidar cache de campañas al actualizar planificaciones con schema público explícito';
