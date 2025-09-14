-- Migration: Recalculate poliza cache when producto_parametros change
-- Date: 2025-09-13
-- Purpose: When product commission percentages or duration change, update base_factor and commission snapshots for related polizas.

-- 1) Helper function: recalc all polizas referencing a given producto_parametro_id
CREATE OR REPLACE FUNCTION recalc_polizas_by_producto_parametro(p_pp_id uuid)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int := 0;
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM polizas WHERE producto_parametro_id = p_pp_id LOOP
    PERFORM recalc_puntos_poliza(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 2) Trigger function: after updates to producto_parametros that affect commission
CREATE OR REPLACE FUNCTION producto_parametros_after_update_recalc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_changed boolean := false;
BEGIN
  -- Detect fields that impact commission or year logic
  IF (NEW.anio_1_percent IS DISTINCT FROM OLD.anio_1_percent) OR
     (NEW.anio_2_percent IS DISTINCT FROM OLD.anio_2_percent) OR
     (NEW.anio_3_percent IS DISTINCT FROM OLD.anio_3_percent) OR
     (NEW.anio_4_percent IS DISTINCT FROM OLD.anio_4_percent) OR
     (NEW.anio_5_percent IS DISTINCT FROM OLD.anio_5_percent) OR
     (NEW.anio_6_percent IS DISTINCT FROM OLD.anio_6_percent) OR
     (NEW.anio_7_percent IS DISTINCT FROM OLD.anio_7_percent) OR
     (NEW.anio_8_percent IS DISTINCT FROM OLD.anio_8_percent) OR
     (NEW.anio_9_percent IS DISTINCT FROM OLD.anio_9_percent) OR
     (NEW.anio_10_percent IS DISTINCT FROM OLD.anio_10_percent) OR
     (NEW.anio_11_plus_percent IS DISTINCT FROM OLD.anio_11_plus_percent) OR
     (NEW.duracion_anios IS DISTINCT FROM OLD.duracion_anios) OR
     (NEW.tipo_producto IS DISTINCT FROM OLD.tipo_producto) OR
     (NEW.activo IS DISTINCT FROM OLD.activo) THEN
    v_changed := true;
  END IF;

  IF v_changed THEN
    PERFORM recalc_polizas_by_producto_parametro(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Create/update the trigger
DROP TRIGGER IF EXISTS trg_producto_parametros_after_update_recalc ON producto_parametros;
CREATE TRIGGER trg_producto_parametros_after_update_recalc
AFTER UPDATE ON producto_parametros
FOR EACH ROW EXECUTE FUNCTION producto_parametros_after_update_recalc();
