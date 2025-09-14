-- RLS policies for poliza_puntos_cache: permitir escritura sólo a supervisores y lectura contextual
-- Fecha: 2025-09-11

-- Limpieza previa
DROP POLICY IF EXISTS sel_poliza_puntos_cache ON poliza_puntos_cache;
DROP POLICY IF EXISTS ins_poliza_puntos_cache_super ON poliza_puntos_cache;
DROP POLICY IF EXISTS upd_poliza_puntos_cache_super ON poliza_puntos_cache;
DROP POLICY IF EXISTS del_poliza_puntos_cache_super ON poliza_puntos_cache;

-- SELECT: el asesor del cliente dueño de la póliza o super
CREATE POLICY sel_poliza_puntos_cache ON poliza_puntos_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM polizas p
      JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = poliza_puntos_cache.poliza_id
        AND (c.asesor_id = auth.uid() OR is_super_role())
    )
  );

-- INSERT: sólo super roles
CREATE POLICY ins_poliza_puntos_cache_super ON poliza_puntos_cache
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());

-- UPDATE: sólo super roles
CREATE POLICY upd_poliza_puntos_cache_super ON poliza_puntos_cache
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

-- DELETE: sólo super roles
CREATE POLICY del_poliza_puntos_cache_super ON poliza_puntos_cache
  FOR DELETE TO authenticated
  USING (is_super_role());
