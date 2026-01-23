-- Migration: Update recalc_puntos_poliza to use configurable thresholds
-- Date: 2026-01-22

CREATE OR REPLACE FUNCTION recalc_puntos_poliza(p_poliza_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estatus estatus_poliza;
  v_prima_input numeric(14,2);
  v_prima_moneda moneda_poliza;
  v_sa_input numeric(14,2);
  v_sa_moneda moneda_poliza;
  v_pp_id uuid;
  v_fecha_emision date;
  v_prima_mxn numeric(14,2);
  v_sa_mxn_live numeric(14,2);
  v_fx numeric(12,6);
  v_udi numeric(12,6);
  v_tipo tipo_producto;
  v_puntos numeric(10,2);
  v_clas tipo_clasificacion_puntos;
  v_base_factor numeric(10,4);
  v_year int;
  -- Variable para almacenar el threshold encontrado
  v_threshold record;
BEGIN
  SELECT estatus, prima_input, prima_moneda, sa_input, sa_moneda, producto_parametro_id, fecha_emision
  INTO v_estatus, v_prima_input, v_prima_moneda, v_sa_input, v_sa_moneda, v_pp_id, v_fecha_emision
  FROM polizas
  WHERE id = p_poliza_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'Póliza % no encontrada', p_poliza_id;
    RETURN;
  END IF;

  IF v_estatus IS NULL OR v_estatus = 'ANULADA'::estatus_poliza THEN
    v_puntos := 0; v_clas := 'CERO'; v_base_factor := NULL; v_prima_mxn := NULL;
  ELSE
    IF v_prima_input IS NULL THEN
      v_prima_mxn := NULL;
    ELSE
      v_prima_mxn := normalize_prima(v_prima_input, v_prima_moneda, CURRENT_DATE);
    END IF;

    IF v_sa_input IS NULL THEN
      v_sa_mxn_live := NULL;
    ELSE
      v_sa_mxn_live := normalize_prima(v_sa_input, v_sa_moneda, CURRENT_DATE);
    END IF;

    v_fx := get_fx_usd(CURRENT_DATE);
    v_udi := get_current_udi(CURRENT_DATE);

    IF v_pp_id IS NULL AND v_sa_mxn_live IS NOT NULL THEN
      SELECT id, tipo_producto
      INTO v_pp_id, v_tipo
      FROM producto_parametros
      WHERE activo = true
        AND (sa_min IS NULL OR v_sa_mxn_live >= sa_min)
        AND (sa_max IS NULL OR v_sa_mxn_live < sa_max)
      ORDER BY
        CASE
          WHEN sa_min IS NOT NULL AND sa_max IS NOT NULL
          THEN ABS(((sa_max + sa_min)/2.0) - v_sa_mxn_live)
          WHEN sa_min IS NOT NULL
          THEN ABS(sa_min - v_sa_mxn_live)
          WHEN sa_max IS NOT NULL
          THEN ABS(sa_max - v_sa_mxn_live)
          ELSE 999999999
        END
      LIMIT 1;

      IF v_pp_id IS NOT NULL THEN
        UPDATE polizas SET producto_parametro_id = v_pp_id WHERE id = p_poliza_id;
      END IF;
    ELSE
      IF v_pp_id IS NOT NULL THEN
        SELECT tipo_producto INTO v_tipo FROM producto_parametros WHERE id = v_pp_id;
      ELSE
        v_tipo := NULL;
      END IF;
    END IF;

    -- NUEVA LÓGICA: Buscar en puntos_thresholds en lugar de hardcodear
    IF v_tipo IS NOT NULL AND v_prima_mxn IS NOT NULL THEN
      -- Buscar el threshold que corresponda según el tipo de producto y la prima
      SELECT *
      INTO v_threshold
      FROM puntos_thresholds
      WHERE tipo_producto = v_tipo
        AND activo = true
        AND v_prima_mxn >= umbral_min
        AND (umbral_max IS NULL OR v_prima_mxn < umbral_max)
      ORDER BY orden
      LIMIT 1;
      
      IF FOUND THEN
        v_puntos := v_threshold.puntos;
        v_clas := v_threshold.clasificacion;
      ELSE
        -- Si no se encuentra threshold, usar valores por defecto
        v_puntos := 0;
        v_clas := 'CERO';
      END IF;
    ELSE
      -- Si no hay tipo o prima, usar valores por defecto
      v_puntos := 0;
      v_clas := 'CERO';
    END IF;
  END IF;

  SELECT poliza_year_vigencia(p.fecha_emision) INTO v_year
  FROM polizas p WHERE p.id = p_poliza_id;

  IF v_pp_id IS NOT NULL AND v_estatus = 'EN_VIGOR'::estatus_poliza THEN
    SELECT CASE
             WHEN COALESCE(duracion_anios, 9999) <= 10 THEN
               CASE LEAST(v_year, COALESCE(duracion_anios, 10))
                 WHEN 1 THEN anio_1_percent
                 WHEN 2 THEN anio_2_percent
                 WHEN 3 THEN anio_3_percent
                 WHEN 4 THEN anio_4_percent
                 WHEN 5 THEN anio_5_percent
                 WHEN 6 THEN anio_6_percent
                 WHEN 7 THEN anio_7_percent
                 WHEN 8 THEN anio_8_percent
                 WHEN 9 THEN anio_9_percent
                 WHEN 10 THEN anio_10_percent
                 ELSE NULL
               END
             ELSE
               CASE
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
           END
      INTO v_base_factor
    FROM producto_parametros
    WHERE id = v_pp_id;
  ELSE
    v_base_factor := NULL;
  END IF;

  v_puntos := COALESCE(v_puntos, 0);
  v_clas := COALESCE(v_clas, 'CERO');

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
           'prima_mxn', v_prima_mxn,
           'sa_mxn', v_sa_mxn_live,
           'prima_moneda', v_prima_moneda,
           'fx_aplicado', v_fx,
           'udi_aplicada', v_udi,
           'tasas_fecha', to_char(CURRENT_DATE, 'YYYY-MM-DD')
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

  UPDATE polizas
  SET clasificacion_actual = v_clas,
      puntos_actuales = v_puntos,
      updated_at = now()
  WHERE id = p_poliza_id;
END;
$$;
