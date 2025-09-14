-- Fix: is_super_role sin comparación bigint=uuid (solo id_auth)
-- Fecha: 2025-09-11
CREATE OR REPLACE FUNCTION is_super_role()
RETURNS boolean
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM usuarios
    WHERE id_auth = auth.uid()
      AND activo IS TRUE
      AND lower(rol) IN ('superusuario','super_usuario','supervisor','admin')
  ) OR jwt_role() IN ('superusuario','super_usuario','supervisor','admin');
END;
$$ LANGUAGE plpgsql;
