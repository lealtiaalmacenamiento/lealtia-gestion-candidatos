-- Permitir UPDATE en poliza_update_requests a roles superiores bajo RLS
-- Motivo: reject_poliza_update() hacía UPDATE ... WHERE estado='PENDIENTE' pero no había política UPDATE,
-- lo que resultaba en 0 filas afectadas y el mensaje 'solicitud no encontrada o no pendiente'.

-- Política de UPDATE para super roles
DROP POLICY IF EXISTS upd_poliza_update_requests_super ON poliza_update_requests;
CREATE POLICY upd_poliza_update_requests_super ON poliza_update_requests
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());
