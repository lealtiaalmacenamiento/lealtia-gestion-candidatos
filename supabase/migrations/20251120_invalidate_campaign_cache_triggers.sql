-- =====================================================
-- Triggers para invalidar cache de campaign_progress
-- cuando cambian datos que afectan la elegibilidad
-- 
-- Cobertura completa de todas las fuentes de datos:
-- 1. candidatos (mes_conexion) ✅
-- 2. polizas → afecta vw_polizas_metricas ✅
-- 3. clientes → afecta vw_polizas_metricas ✅
-- 4. prospectos → afecta vw_rc_metricas ✅
-- 5. planificaciones ✅
-- 6. campaigns_custom_metrics ✅
-- 7. user_segments (SEGMENT rules) ✅
--
-- IMPORTANTE: Las vistas materializadas (vw_polizas_metricas, 
-- vw_cancelaciones_indices, vw_rc_metricas) se refrescan cada 5-10 
-- minutos. Los triggers en tablas base (polizas, clientes, prospectos)
-- invalidan el cache inmediatamente, pero los datos en las vistas
-- pueden tardar hasta 10 min en actualizarse.
--
-- Solución recomendada: Combinar estos triggers con TTL de 5 minutos
-- para balance entre precisión y carga en la DB.
-- =====================================================

-- Función para invalidar cache por usuario
CREATE OR REPLACE FUNCTION invalidate_campaign_cache_for_user(p_usuario_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM campaign_progress WHERE usuario_id = p_usuario_id;
  -- Comentar en producción si genera mucho ruido en logs
  -- RAISE NOTICE 'Cache de campañas invalidado para usuario %', p_usuario_id;
END;
$$;

-- Función para invalidar cache cuando cambia candidatos.mes_conexion
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_candidatos()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- Solo invalidar si cambió mes_conexion
  IF (TG_OP = 'UPDATE' AND OLD.mes_conexion IS DISTINCT FROM NEW.mes_conexion) 
     OR TG_OP = 'INSERT' THEN
    
    -- Buscar el usuario_id por email
    SELECT u.id INTO v_usuario_id
    FROM usuarios u
    WHERE LOWER(u.email) = LOWER(COALESCE(NEW.email_agente, ''))
    LIMIT 1;
    
    IF v_usuario_id IS NOT NULL THEN
      PERFORM invalidate_campaign_cache_for_user(v_usuario_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Función para invalidar cache cuando cambian pólizas
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_polizas()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- Obtener usuario_id del cliente asociado
  SELECT c.asesor_id INTO v_usuario_id
  FROM clientes c
  JOIN usuarios u ON u.id_auth = c.asesor_id
  WHERE c.id = COALESCE(NEW.cliente_id, OLD.cliente_id)
  LIMIT 1;
  
  IF v_usuario_id IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Función para invalidar cache cuando cambian clientes
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_clientes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- Obtener usuario_id del asesor
  SELECT u.id INTO v_usuario_id
  FROM usuarios u
  WHERE u.id_auth = COALESCE(NEW.asesor_id, OLD.asesor_id)
  LIMIT 1;
  
  IF v_usuario_id IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Crear triggers
DROP TRIGGER IF EXISTS trg_invalidate_cache_candidatos ON candidatos;
CREATE TRIGGER trg_invalidate_cache_candidatos
  AFTER INSERT OR UPDATE ON candidatos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_candidatos();

DROP TRIGGER IF EXISTS trg_invalidate_cache_polizas ON polizas;
CREATE TRIGGER trg_invalidate_cache_polizas
  AFTER INSERT OR UPDATE OR DELETE ON polizas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_polizas();

DROP TRIGGER IF EXISTS trg_invalidate_cache_clientes ON clientes;
CREATE TRIGGER trg_invalidate_cache_clientes
  AFTER INSERT OR UPDATE OR DELETE ON clientes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_clientes();

-- Función para invalidar cache cuando cambian prospectos (RC metrics)
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_prospectos()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- Obtener usuario_id del agente
  SELECT u.id INTO v_usuario_id
  FROM usuarios u
  WHERE u.id = COALESCE(NEW.agente_id, OLD.agente_id)
  LIMIT 1;
  
  IF v_usuario_id IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Función para invalidar cache cuando cambian planificaciones
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_planificaciones()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- agente_id en planificaciones es directamente el usuario_id
  v_usuario_id := COALESCE(NEW.agente_id, OLD.agente_id);
  
  IF v_usuario_id IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Función para invalidar cache cuando cambian custom metrics
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_custom_metrics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.usuario_id, OLD.usuario_id) IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(COALESCE(NEW.usuario_id, OLD.usuario_id));
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Función para invalidar cache cuando cambian segmentos de usuario
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_user_segments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.usuario_id, OLD.usuario_id) IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(COALESCE(NEW.usuario_id, OLD.usuario_id));
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Crear triggers adicionales
DROP TRIGGER IF EXISTS trg_invalidate_cache_prospectos ON prospectos;
CREATE TRIGGER trg_invalidate_cache_prospectos
  AFTER INSERT OR UPDATE OR DELETE ON prospectos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_prospectos();

DROP TRIGGER IF EXISTS trg_invalidate_cache_planificaciones ON planificaciones;
CREATE TRIGGER trg_invalidate_cache_planificaciones
  AFTER INSERT OR UPDATE OR DELETE ON planificaciones
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_planificaciones();

DROP TRIGGER IF EXISTS trg_invalidate_cache_custom_metrics ON campaigns_custom_metrics;
CREATE TRIGGER trg_invalidate_cache_custom_metrics
  AFTER INSERT OR UPDATE OR DELETE ON campaigns_custom_metrics
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_custom_metrics();

DROP TRIGGER IF EXISTS trg_invalidate_cache_user_segments ON user_segments;
CREATE TRIGGER trg_invalidate_cache_user_segments
  AFTER INSERT OR UPDATE OR DELETE ON user_segments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_user_segments();

-- Comentarios
COMMENT ON FUNCTION invalidate_campaign_cache_for_user IS 
  'Invalida el cache de campaign_progress para un usuario específico';

COMMENT ON FUNCTION trigger_invalidate_cache_on_candidatos IS 
  'Invalida cache cuando cambia mes_conexion u otros datos de candidatos';

COMMENT ON FUNCTION trigger_invalidate_cache_on_polizas IS 
  'Invalida cache cuando se crean/modifican/eliminan pólizas';

COMMENT ON FUNCTION trigger_invalidate_cache_on_clientes IS 
  'Invalida cache cuando se crean/modifican/eliminan clientes';

COMMENT ON FUNCTION trigger_invalidate_cache_on_prospectos IS 
  'Invalida cache cuando cambian prospectos (afecta RC metrics)';

COMMENT ON FUNCTION trigger_invalidate_cache_on_planificaciones IS 
  'Invalida cache cuando cambian planificaciones';

COMMENT ON FUNCTION trigger_invalidate_cache_on_custom_metrics IS 
  'Invalida cache cuando cambian métricas personalizadas de campañas';

COMMENT ON FUNCTION trigger_invalidate_cache_on_user_segments IS 
  'Invalida cache cuando cambian los segmentos del usuario (afecta elegibilidad por SEGMENT rules)';
