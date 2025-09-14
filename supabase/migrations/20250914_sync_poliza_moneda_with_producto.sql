-- Sync polizas.prima_moneda and sa_moneda with producto_parametros.moneda automatically
-- Fecha: 2025-09-14

-- 1) Trigger function: when producto_parametros.moneda changes, update related polizas.prima_moneda
CREATE OR REPLACE FUNCTION producto_parametros_after_update_sync_moneda()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_changed boolean := false;
  v_updated int := 0;
BEGIN
  IF NEW.moneda IS DISTINCT FROM OLD.moneda THEN
    v_changed := true;
  END IF;

  IF v_changed THEN
    -- Si la nueva moneda es NULL, no forzamos sincronización (sin especificación de moneda)
    IF NEW.moneda IS NOT NULL THEN
      -- Actualizar moneda de primas y suma asegurada de pólizas que apuntan a este producto
      UPDATE polizas
        SET prima_moneda = NEW.moneda,
            sa_moneda = NEW.moneda,
            updated_at = now()
        WHERE producto_parametro_id = NEW.id
          AND (
            prima_moneda IS DISTINCT FROM NEW.moneda
            OR sa_moneda IS DISTINCT FROM NEW.moneda
            OR sa_moneda IS NULL
          );
    END IF;

    -- Recalcular cache/puntos de las pólizas afectadas
    PERFORM recalc_polizas_by_producto_parametro(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Adjuntar a un trigger AFTER UPDATE en producto_parametros (reutilizamos el trigger existente agregando una segunda función o creamos otro)
DROP TRIGGER IF EXISTS trg_producto_parametros_after_update_sync_moneda ON producto_parametros;
CREATE TRIGGER trg_producto_parametros_after_update_sync_moneda
AFTER UPDATE ON producto_parametros
FOR EACH ROW EXECUTE FUNCTION producto_parametros_after_update_sync_moneda();

-- 3) Enforce at write-time: BEFORE INSERT/UPDATE on polizas to align moneda with producto_parametros.moneda
CREATE OR REPLACE FUNCTION polizas_before_insupd_enforce_moneda()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_moneda moneda_poliza;
BEGIN
  IF NEW.producto_parametro_id IS NOT NULL THEN
    SELECT moneda INTO v_moneda FROM producto_parametros WHERE id = NEW.producto_parametro_id;
    IF v_moneda IS NOT NULL THEN
      NEW.prima_moneda := v_moneda;
      NEW.sa_moneda := v_moneda;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_polizas_before_insupd_enforce_moneda ON polizas;
CREATE TRIGGER trg_polizas_before_insupd_enforce_moneda
BEFORE INSERT OR UPDATE ON polizas
FOR EACH ROW EXECUTE FUNCTION polizas_before_insupd_enforce_moneda();

-- 4) One-time backfill: align existing polizas with producto_parametros.moneda and recalc affected
WITH updated_rows AS (
  UPDATE polizas p
  SET prima_moneda = pp.moneda,
      sa_moneda = pp.moneda,
      updated_at = now()
  FROM producto_parametros pp
  WHERE p.producto_parametro_id = pp.id
    AND pp.moneda IS NOT NULL
    AND (
      p.prima_moneda IS DISTINCT FROM pp.moneda
      OR p.sa_moneda IS DISTINCT FROM pp.moneda
      OR p.sa_moneda IS NULL
    )
  RETURNING p.producto_parametro_id
)
SELECT recalc_polizas_by_producto_parametro(u.producto_parametro_id)
FROM (SELECT DISTINCT producto_parametro_id FROM updated_rows WHERE producto_parametro_id IS NOT NULL) u;
