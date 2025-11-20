-- Fix: is_super_role elimina comparación inválida bigint(uuid)
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
  WHERE id_auth = auth.uid()
    AND activo IS TRUE
    AND lower(rol) IN ('supervisor','admin')
  LIMIT 1;

  IF v_is_super THEN
    RETURN TRUE;
  END IF;

  RETURN jwt_role() IN ('supervisor','admin');
END;
$$;

-- NOTA: Si existen usuarios sin id_auth, ejecutar (como admin):
--   UPDATE usuarios SET id_auth = '<UUID_SUPABASE_AUTH>' WHERE id = <id_numérico> AND id_auth IS NULL;
-- Verificar:
--   SELECT id, id_auth, rol, activo FROM usuarios WHERE id_auth = '<UUID_SUPABASE_AUTH>';
