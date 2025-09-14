-- Fecha: 2025-09-10
-- Objetivo: Alinear is_super_role() con el frontend y permitir 'superusuario' y 'admin'.
-- Además, resolver casos donde el JWT no incluya 'role' usando lookup en tabla usuarios por auth.uid().

CREATE OR REPLACE FUNCTION is_super_role()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean := false;
BEGIN
  -- 1) Verificar en tabla usuarios por id_auth (requiere que usuarios.id_auth esté poblado)
  SELECT TRUE
    INTO v_is_super
  FROM usuarios
  WHERE id_auth = auth.uid()
    AND activo IS TRUE
    AND lower(rol) IN ('superusuario','super_usuario','supervisor','admin')
  LIMIT 1;

  IF v_is_super THEN
    RETURN TRUE;
  END IF;

  -- 2) Fallback a claim del JWT si existe
  RETURN jwt_role() IN ('superusuario','super_usuario','supervisor','admin');
END;
$$;
