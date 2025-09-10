-- Fecha: 2025-09-09
-- Objetivo: Permitir lectura a usuarios autenticados y escritura sólo a roles superiores

-- Políticas udi_values
DROP POLICY IF EXISTS sel_udi_values ON udi_values;
CREATE POLICY sel_udi_values ON udi_values
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS ins_udi_values_super ON udi_values;
CREATE POLICY ins_udi_values_super ON udi_values
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());

DROP POLICY IF EXISTS upd_udi_values_super ON udi_values;
CREATE POLICY upd_udi_values_super ON udi_values
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

DROP POLICY IF EXISTS del_udi_values_super ON udi_values;
CREATE POLICY del_udi_values_super ON udi_values
  FOR DELETE TO authenticated
  USING (is_super_role());

-- Políticas fx_values
DROP POLICY IF EXISTS sel_fx_values ON fx_values;
CREATE POLICY sel_fx_values ON fx_values
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS ins_fx_values_super ON fx_values;
CREATE POLICY ins_fx_values_super ON fx_values
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());

DROP POLICY IF EXISTS upd_fx_values_super ON fx_values;
CREATE POLICY upd_fx_values_super ON fx_values
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

DROP POLICY IF EXISTS del_fx_values_super ON fx_values;
CREATE POLICY del_fx_values_super ON fx_values
  FOR DELETE TO authenticated
  USING (is_super_role());
