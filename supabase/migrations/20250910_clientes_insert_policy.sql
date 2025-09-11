-- Fecha: 2025-09-10
-- Objetivo: Permitir INSERT en clientes para usuarios autenticados, limitado a su propio asesor_id, o libre para super roles

-- Política de INSERT para clientes
DROP POLICY IF EXISTS ins_clientes_asesor ON clientes;
CREATE POLICY ins_clientes_asesor ON clientes
  FOR INSERT TO authenticated
  WITH CHECK (asesor_id = auth.uid() OR is_super_role());
