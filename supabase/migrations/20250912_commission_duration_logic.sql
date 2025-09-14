-- Sprint: Commission duration-aware logic and EN_VIGOR gating
-- Date: 2025-09-12
-- Updates recalc_puntos_poliza to:
--  - Compute base_factor (commission percent) considering producto_parametros.duracion_anios
--  - If duracion_anios <= 10 and v_year > duracion, clamp to last defined anio_{dur}_percent
--  - If duracion_anios >= 11 (or NULL), use anio_11_plus_percent for years >= 11
--  - Set base_factor = NULL when estatus != 'EN_VIGOR'

CREATE OR REPLACE FUNCTION recalc_puntos_poliza(p_poliza_id uuid)
RETURNS void
AS $$
DECLARE
  v_prima_mxn numeric;
  v_prima_moneda moneda_poliza;
  v_sa_mxn numeric;
  v_sa_input numeric;
  v_sa_moneda moneda_poliza;
  v_tipo tipo_producto;
  v_estatus estatus_poliza;
  v_pp_id uuid;
  v_year int;
  v_base_factor numeric;
  v_puntos numeric;
  v_clas tipo_clasificacion_puntos;
  v_fx numeric;
  v_udi numeric;
  v_fecha date;
  v_pp_auto uuid;
BEGIN
  -- Datos base de la póliza
  SELECT p.prima_mxn, p.prima_moneda, p.sa_mxn, p.sa_input, p.sa_moneda,
         p.estatus, p.producto_parametro_id, p.fecha_emision
    INTO v_prima_mxn, v_prima_moneda, v_sa_mxn, v_sa_input, v_sa_moneda,
         v_estatus, v_pp_id, v_fecha
  FROM polizas p
  WHERE p.id = p_poliza_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'poliza % no existe', p_poliza_id;
  END IF;

  -- Tasas aplicadas para auditoría
  v_fx := NULL; v_udi := NULL;
  IF v_prima_moneda = 'USD'::moneda_poliza THEN
    SELECT get_fx_usd(v_fecha) INTO v_fx;
  ELSIF v_prima_moneda = 'UDI'::moneda_poliza THEN
    SELECT get_current_udi(v_fecha) INTO v_udi;
  END IF;

  -- Auto-selección de variante si no viene asignada
  IF v_pp_id IS NULL THEN
    SELECT pp.id
      INTO v_pp_auto
    FROM producto_parametros pp
    WHERE pp.activo = true
      AND (pp.moneda IS NULL OR pp.moneda = v_prima_moneda)
      AND (
        v_sa_mxn IS NULL
        OR (
          (pp.sa_min IS NULL OR v_sa_mxn >= pp.sa_min)
          AND (pp.sa_max IS NULL OR v_sa_mxn <= pp.sa_max)
        )
      )
    ORDER BY 
      CASE WHEN pp.moneda = v_prima_moneda THEN 0 ELSE 1 END,
      COALESCE(pp.sa_min, (-1)::numeric) DESC
    LIMIT 1;

    IF v_pp_auto IS NOT NULL THEN
      v_pp_id := v_pp_auto;
      UPDATE polizas SET producto_parametro_id = v_pp_auto, updated_at = now()
      WHERE id = p_poliza_id;
    END IF;
  END IF;

  -- Si anulada, deja en cero para puntos
  IF v_estatus = 'ANULADA'::estatus_poliza THEN
    v_puntos := 0;
    v_clas := 'CERO';
  ELSE
    -- Tipo de producto
    IF v_pp_id IS NOT NULL THEN
      SELECT tipo_producto INTO v_tipo FROM producto_parametros WHERE id = v_pp_id;
    ELSE
      v_tipo := NULL;
    END IF;

    -- Clasificación por rangos en MXN (independiente del factor de comisión)
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
      -- Tipo desconocido o sin producto: coalesce a cero para cumplir NOT NULL
      v_puntos := 0; v_clas := 'CERO';
    END IF;
  END IF;

  -- Año de vigencia
  SELECT poliza_year_vigencia(p.fecha_emision) INTO v_year
  FROM polizas p WHERE p.id = p_poliza_id;

  -- Base factor (porcentaje anual) con lógica de duración y solo EN_VIGOR
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

  -- Garantiza no-nulos antes de escribir
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
           'sa_mxn', v_sa_mxn,
           'prima_moneda', v_prima_moneda,
           'fx_aplicado', v_fx,
           'udi_aplicada', v_udi
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
$$ LANGUAGE plpgsql;
