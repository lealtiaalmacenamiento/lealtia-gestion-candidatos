-- Fase 3 – Sprint 3: Puntos y caché
-- Fecha: 2025-09-08
-- Objetivo: cálculo de puntos (VI/GMM) por rangos, snapshot en cache y denormalización en polizas

-- Función auxiliar: obtener año de vigencia (mín 1)
CREATE OR REPLACE FUNCTION poliza_year_vigencia(p_fecha_emision date)
RETURNS int
AS $$
BEGIN
  RETURN GREATEST(
    1,
    (EXTRACT(YEAR FROM age(CURRENT_DATE, p_fecha_emision))::int + 1)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Función principal: recálculo de puntos por poliza
CREATE OR REPLACE FUNCTION recalc_puntos_poliza(p_poliza_id uuid)
RETURNS void
AS $$
DECLARE
  v_prima_mxn numeric;
  v_tipo tipo_producto;
  v_estatus estatus_poliza;
  v_pp_id uuid;
  v_year int;
  v_base_factor numeric;
  v_puntos numeric;
  v_clas tipo_clasificacion_puntos;
  v_fx numeric;
  v_udi numeric;
BEGIN
  -- Datos base de la póliza
  SELECT p.prima_mxn, p.estatus, p.producto_parametro_id
    INTO v_prima_mxn, v_estatus, v_pp_id
  FROM polizas p
  WHERE p.id = p_poliza_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'poliza % no existe', p_poliza_id;
  END IF;

  -- Si anulada, deja en cero
  IF v_estatus = 'ANULADA'::estatus_poliza THEN
    v_puntos := 0;
    v_clas := 'CERO';
  ELSE
    -- Tipo de producto
    IF v_pp_id IS NOT NULL THEN
      SELECT tipo_producto INTO v_tipo FROM producto_parametros WHERE id = v_pp_id;
    ELSE
      -- Si no hay producto asignado, no podemos clasificar
      v_tipo := NULL;
    END IF;

    -- Clasificación por rangos en MXN
    IF v_tipo = 'GMM'::tipo_producto THEN
      IF v_prima_mxn IS NOT NULL AND v_prima_mxn >= 7500 THEN
        v_puntos := 0.5; v_clas := 'MEDIO';
      ELSE
        v_puntos := 0; v_clas := 'CERO';
      END IF;
    ELSIF v_tipo = 'VI'::tipo_producto THEN
      IF v_prima_mxn IS NULL OR v_prima_mxn < 15000 THEN
        v_puntos := 0; v_clas := 'CERO';
      ELSIF v_prima_mxn >= 150000 THEN
        v_puntos := 3; v_clas := 'TRIPLE';
      ELSIF v_prima_mxn >= 50000 THEN
        v_puntos := 2; v_clas := 'DOBLE';
      ELSE
        v_puntos := 1; v_clas := 'SIMPLE';
      END IF;
    ELSE
      -- Tipo desconocido o sin producto: no clasificar
      v_puntos := NULL; v_clas := NULL;
    END IF;
  END IF;

  -- Año de vigencia
  SELECT poliza_year_vigencia(p.fecha_emision) INTO v_year
  FROM polizas p WHERE p.id = p_poliza_id;

  -- Base factor (porcentaje anual) desde producto_parametros (si existe)
  IF v_pp_id IS NOT NULL THEN
    SELECT CASE
             WHEN v_year = 1 THEN anio_1_percent
             WHEN v_year = 2 THEN anio_2_percent
             WHEN v_year = 3 THEN anio_3_percent
             WHEN v_year = 4 THEN anio_4_percent
             WHEN v_year = 5 THEN anio_5_percent
             WHEN v_year = 6 THEN anio_6_percent
             WHEN v_year = 7 THEN anio_7_percent
             WHEN v_year = 8 THEN anio_8_percent
             WHEN v_year = 9 THEN anio_9_percent
             WHEN v_year = 10 THEN anio_10_percent
             ELSE anio_11_plus_percent
           END
      INTO v_base_factor
    FROM producto_parametros
    WHERE id = v_pp_id;
  ELSE
    v_base_factor := NULL;
  END IF;

  -- Tasas (para auditoría) si la prima no es MXN
  v_fx := NULL; v_udi := NULL;
  PERFORM 1;

  -- UPSERT en cache
  INSERT INTO poliza_puntos_cache (
    poliza_id, puntos_total, clasificacion, base_factor, producto_factor,
    year_factor, prima_anual_snapshot, producto_parametro_id, udi_valor, usd_fx,
    breakdown, recalculo_reason, computed_at, updated_at
  )
  SELECT p.id, v_puntos, v_clas, v_base_factor, NULL,
         v_year, v_prima_mxn, v_pp_id, v_udi, v_fx,
         jsonb_build_object(
           'year', v_year,
           'factor_base', v_base_factor,
           'producto', v_tipo,
           'prima_mxn', v_prima_mxn
         ),
         'recalc', now(), now()
  FROM polizas p WHERE p.id = p_poliza_id
  ON CONFLICT (poliza_id) DO UPDATE SET
    puntos_total = EXCLUDED.puntos_total,
    clasificacion = EXCLUDED.clasificacion,
    base_factor = EXCLUDED.base_factor,
    producto_factor = EXCLUDED.producto_factor,
    year_factor = EXCLUDED.year_factor,
    prima_anual_snapshot = EXCLUDED.prima_anual_snapshot,
    producto_parametro_id = EXCLUDED.producto_parametro_id,
    udi_valor = EXCLUDED.udi_valor,
    usd_fx = EXCLUDED.usd_fx,
    breakdown = EXCLUDED.breakdown,
    recalculo_reason = EXCLUDED.recalculo_reason,
    updated_at = now();

  -- Denormaliza en polizas
  UPDATE polizas
  SET clasificacion_actual = v_clas,
      puntos_actuales = v_puntos,
      updated_at = now()
  WHERE id = p_poliza_id;
END;
$$ LANGUAGE plpgsql;

-- Triggers AFTER para recalcular al cambiar datos relevantes
CREATE OR REPLACE FUNCTION polizas_after_change_recalc()
RETURNS trigger
AS $$
BEGIN
  PERFORM recalc_puntos_poliza(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_polizas_after_insert_recalc ON polizas;
CREATE TRIGGER trg_polizas_after_insert_recalc
AFTER INSERT ON polizas
FOR EACH ROW EXECUTE FUNCTION polizas_after_change_recalc();

DROP TRIGGER IF EXISTS trg_polizas_after_update_recalc ON polizas;
CREATE TRIGGER trg_polizas_after_update_recalc
AFTER UPDATE OF prima_input, prima_moneda, estatus, producto_parametro_id ON polizas
FOR EACH ROW EXECUTE FUNCTION polizas_after_change_recalc();
