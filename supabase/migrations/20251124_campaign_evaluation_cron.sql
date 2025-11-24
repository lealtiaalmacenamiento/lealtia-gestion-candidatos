-- =====================================================
-- Función y Cron Job para evaluación automática de campañas
-- =====================================================
-- Esta función evalúa automáticamente el progreso de campañas activas
-- para todos los usuarios y actualiza la tabla campaign_progress.
-- Se ejecuta cada hora vía pg_cron.
-- =====================================================

-- Función para evaluar campañas de todos los usuarios
CREATE OR REPLACE FUNCTION evaluate_all_campaigns()
RETURNS TABLE(
  usuarios_procesados integer,
  campanas_evaluadas integer,
  snapshots_actualizados integer,
  duracion_ms bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_time timestamp;
  v_end_time timestamp;
  v_usuarios_count integer := 0;
  v_campanas_count integer := 0;
  v_snapshots_count integer := 0;
  v_usuario_id integer;
  v_campaign_id uuid;
BEGIN
  v_start_time := clock_timestamp();
  
  -- Nota: Esta es una implementación simplificada que limpia cache antiguo
  -- La evaluación real se hace on-demand cuando el usuario accede a /campanias
  -- Aquí solo limpiamos snapshots obsoletos (>30 minutos)
  
  DELETE FROM campaign_progress
  WHERE evaluated_at < NOW() - INTERVAL '30 minutes';
  
  GET DIAGNOSTICS v_snapshots_count = ROW_COUNT;
  
  -- Contar usuarios activos que tienen campañas
  SELECT COUNT(DISTINCT u.id) INTO v_usuarios_count
  FROM usuarios u
  WHERE u.activo = true 
    AND u.rol IN ('agente', 'asesor', 'supervisor');
  
  -- Contar campañas activas
  SELECT COUNT(*) INTO v_campanas_count
  FROM campaigns
  WHERE status = 'active'
    AND active_range @> CURRENT_DATE;
  
  v_end_time := clock_timestamp();
  
  RAISE NOTICE 'Limpieza de cache completada: % snapshots eliminados, % usuarios activos, % campañas activas',
    v_snapshots_count, v_usuarios_count, v_campanas_count;
  
  RETURN QUERY SELECT 
    v_usuarios_count,
    v_campanas_count,
    v_snapshots_count,
    EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::bigint;
END;
$$;

COMMENT ON FUNCTION evaluate_all_campaigns IS 
  'Limpia cache antiguo de campaign_progress. La evaluación real es on-demand cuando usuarios acceden a /campanias.';

-- Programar cron job para ejecutar cada hora
-- Nota: Se ejecuta cada hora para limpiar cache, no para evaluar
SELECT cron.schedule(
  'cleanup-campaign-cache',
  '0 * * * *',  -- cada hora en el minuto 0
  $$SELECT evaluate_all_campaigns();$$
);

COMMENT ON FUNCTION evaluate_all_campaigns IS 
  'Limpia snapshots de campaign_progress más antiguos de 30 minutos. Programado para ejecutarse cada hora vía pg_cron.';
