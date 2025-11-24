-- Fix: Corregir trigger de invalidación de cache de pólizas
-- El problema es que intenta asignar asesor_id (uuid) a usuario_id (bigint)

CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_polizas()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- Obtener usuario_id del cliente asociado
  SELECT u.id INTO v_usuario_id
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
