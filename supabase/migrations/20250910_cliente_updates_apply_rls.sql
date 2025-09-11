-- Fecha: 2025-09-10
-- Objetivo: Permitir que la función apply_cliente_update pueda actualizar cliente_update_requests e insertar en cliente_historial bajo RLS

-- UPDATE en cliente_update_requests solo para roles superiores
DROP POLICY IF EXISTS upd_cliente_update_requests_super ON cliente_update_requests;
CREATE POLICY upd_cliente_update_requests_super ON cliente_update_requests
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

-- INSERT en cliente_historial solo para roles superiores
DROP POLICY IF EXISTS ins_cliente_historial_super ON cliente_historial;
CREATE POLICY ins_cliente_historial_super ON cliente_historial
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());
