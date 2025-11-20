-- RLS policies for historial_costos_poliza: permitir INSERT a roles superiores
-- Fecha: 2025-09-14

-- Habilitado en sprint 1: ALTER TABLE historial_costos_poliza ENABLE ROW LEVEL SECURITY;
-- Faltaba una policy de inserción para supervisores/admin

DO $$ BEGIN
  PERFORM 1 FROM pg_proc WHERE proname = 'is_super_role';
  -- Si no existe la función, sólo creamos una policy abierta a authenticated (fallback)
END $$;

-- Limpiamos políticas previas si hubiera
DROP POLICY IF EXISTS sel_historial_costos_poliza_super ON historial_costos_poliza;
DROP POLICY IF EXISTS ins_historial_costos_poliza_super ON historial_costos_poliza;

-- Lectura para roles superiores
CREATE POLICY sel_historial_costos_poliza_super ON historial_costos_poliza
  FOR SELECT
  TO authenticated
  USING (
    -- permitir si usuario tiene rol superior
    EXISTS (
      SELECT 1 FROM usuarios u WHERE u.id_auth = auth.uid() AND lower(u.rol) IN ('supervisor','admin')
    )
  );

-- Inserción para roles superiores (RPC aplica cambios con auth.uid())
CREATE POLICY ins_historial_costos_poliza_super ON historial_costos_poliza
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u WHERE u.id_auth = auth.uid() AND lower(u.rol) IN ('supervisor','admin')
    )
  );
