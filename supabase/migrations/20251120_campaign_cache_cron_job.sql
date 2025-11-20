-- =====================================================
-- Cron job para limpiar cache antiguo de campaign_progress
-- Se ejecuta cada 10 minutos y elimina registros > 5 minutos
-- =====================================================

-- Habilitar pg_cron si no está habilitado (solo una vez, requiere permisos de superuser)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Función para limpiar cache antiguo
CREATE OR REPLACE FUNCTION clean_stale_campaign_cache()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  -- Eliminar registros evaluados hace más de 5 minutos
  DELETE FROM campaign_progress
  WHERE evaluated_at < NOW() - INTERVAL '5 minutes';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cache antiguo limpiado: % registros eliminados', v_deleted_count;
END;
$$;

-- Programar cron job (ejecutar cada 10 minutos)
-- Nota: pg_cron solo está disponible en planes Supabase Pro o superior
/*
SELECT cron.schedule(
  'clean-campaign-cache',           -- nombre del job
  '*/10 * * * *',                    -- cada 10 minutos
  $$SELECT clean_stale_campaign_cache();$$
);
*/

-- Para desarrollo/testing, puedes ejecutar manualmente:
-- SELECT clean_stale_campaign_cache();

-- Ver jobs programados:
-- SELECT * FROM cron.job;

-- Eliminar job si es necesario:
-- SELECT cron.unschedule('clean-campaign-cache');

COMMENT ON FUNCTION clean_stale_campaign_cache IS 
  'Elimina registros de campaign_progress evaluados hace más de 5 minutos. Usar con pg_cron.';
