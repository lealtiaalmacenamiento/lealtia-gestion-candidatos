-- Fix: is_super_role acepta coincidencia por usuarios.id o usuarios.id_auth
-- Fecha: 2025-09-11
CREATE OR REPLACE FUNCTION is_super_role()
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_super boolean := false;
BEGIN
  SELECT TRUE INTO v_is_super
  FROM usuarios
  WHERE (id_auth = auth.uid() OR id = auth.uid())
    AND activo IS TRUE
    AND lower(rol) IN ('supervisor','admin')
  LIMIT 1;

  IF v_is_super THEN
    RETURN TRUE;
  END IF;

  RETURN jwt_role() IN ('supervisor','admin');
END;
$$;
