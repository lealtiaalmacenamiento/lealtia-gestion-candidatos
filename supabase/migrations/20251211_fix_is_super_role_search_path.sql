-- =====================================================
-- Migration: Fix is_super_role search_path for security
-- Date: 2024-12-11
-- Description: Update is_super_role to use explicit schema
--              and empty search_path for security
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_super_role()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_super boolean := false;
BEGIN
  -- Check usuarios table by id_auth (requires usuarios.id_auth populated)
  SELECT TRUE INTO v_is_super
  FROM public.usuarios
  WHERE id_auth = auth.uid()
    AND activo IS TRUE
    AND lower(rol) IN ('supervisor','admin')
  LIMIT 1;

  IF v_is_super THEN
    RETURN TRUE;
  END IF;

  -- Fallback: check JWT role claim
  RETURN public.jwt_role() IN ('supervisor','admin');
END;
$$;

COMMENT ON FUNCTION public.is_super_role() IS 'Determina si el usuario autenticado tiene rol supervisor o admin. Usa schema explícito para seguridad.';
