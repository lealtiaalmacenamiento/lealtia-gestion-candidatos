-- Script consolidado para aplicar migraciones de puntos configurables
-- Fecha: 2026-01-22
-- Ejecutar en Supabase SQL Editor en PRODUCCIÓN

-- ============================================================================
-- MIGRACIÓN 1: Crear tabla puntos_thresholds
-- ============================================================================

-- Tabla para configurar umbrales de puntos por tipo de producto
CREATE TABLE IF NOT EXISTS puntos_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_producto tipo_producto NOT NULL,
  umbral_min numeric(14,2) NOT NULL,
  umbral_max numeric(14,2) NULL,
  puntos numeric(10,2) NOT NULL,
  clasificacion tipo_clasificacion_puntos NOT NULL,
  descripcion text NULL,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  creado_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_puntos_thresholds_umbral_valido CHECK (umbral_max IS NULL OR umbral_max > umbral_min)
);

CREATE INDEX IF NOT EXISTS idx_puntos_thresholds_lookup 
  ON puntos_thresholds(tipo_producto, activo, orden) 
  WHERE activo = true;

-- Insertar valores por defecto (equivalentes a la lógica hardcodeada actual)
INSERT INTO puntos_thresholds (tipo_producto, umbral_min, umbral_max, puntos, clasificacion, descripcion, orden) VALUES
-- GMM: 0.5 puntos si prima >= 7500, else 0
('GMM', 0, 7500, 0, 'CERO', 'Prima menor a $7,500', 1),
('GMM', 7500, NULL, 0.5, 'MEDIO', 'Prima de $7,500 o más', 2),

-- VI: 0 (<15k), 1 (15k-50k), 2 (50k-150k), 3 (>=150k)
('VI', 0, 15000, 0, 'CERO', 'Prima menor a $15,000', 1),
('VI', 15000, 50000, 1, 'SIMPLE', 'Prima entre $15,000 y $50,000', 2),
('VI', 50000, 150000, 2, 'DOBLE', 'Prima entre $50,000 y $150,000', 3),
('VI', 150000, NULL, 3, 'TRIPLE', 'Prima de $150,000 o más', 4)
ON CONFLICT DO NOTHING;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp_puntos_thresholds()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_puntos_thresholds ON puntos_thresholds;
CREATE TRIGGER set_timestamp_puntos_thresholds
  BEFORE UPDATE ON puntos_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp_puntos_thresholds();

-- RLS policies (solo admin/supervisor pueden modificar)
ALTER TABLE puntos_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden ver puntos_thresholds" ON puntos_thresholds
  FOR SELECT
  USING (true);

CREATE POLICY "Solo admin/supervisor pueden modificar puntos_thresholds" ON puntos_thresholds
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id_auth::text = auth.uid()::text
      AND rol IN ('admin', 'supervisor')
    )
  );

-- ============================================================================
-- MIGRACIÓN 2: Fix encoding (si hay problemas de caracteres)
-- ============================================================================

-- Actualizar descripciones con caracteres correctos
UPDATE puntos_thresholds 
SET descripcion = 'Prima de $7,500 o más'
WHERE tipo_producto = 'GMM' AND umbral_min = 7500;

UPDATE puntos_thresholds 
SET descripcion = 'Prima de $150,000 o más'
WHERE tipo_producto = 'VI' AND umbral_min = 150000;

-- ============================================================================
-- MIGRACIÓN 3: Actualizar función recalc_puntos_poliza
-- ============================================================================

CREATE OR REPLACE FUNCTION recalc_puntos_poliza(p_poliza_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_threshold RECORD;
BEGIN
  -- 1) Leer póliza
  SELECT estatus, prima_input, prima_moneda, sa_input, sa_moneda, producto_parametro_id, fecha_emision, prima_mxn
    INTO v_estatus, v_prima_input, v_prima_moneda, v_sa_input, v_sa_moneda, v_pp_id, v_fecha_emision, v_prima_mxn
  FROM polizas
  WHERE id = p_poliza_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Si no está en vigor, resetear y salir
  IF v_estatus <> 'EN_VIGOR' THEN
    v_puntos := 0;
    v_clas := 'CERO';
    v_base_factor := 0;
    v_year := 0;
    GOTO finalize;
  END IF;

  -- 2) Obtener tipo de producto y factores
  SELECT pp.tipo_producto, pt.id
    INTO v_tipo, v_pp_id
  FROM producto_parametros pp
  JOIN product_types pt ON pt.code = pp.tipo_producto
  WHERE pp.id = v_pp_id;

  IF NOT FOUND THEN
    v_puntos := 0;
    v_clas := 'CERO';
    v_base_factor := 0;
    v_year := 0;
    GOTO finalize;
  END IF;

  -- 3) Normalizar prima a MXN si es necesario
  IF v_prima_mxn IS NULL OR v_prima_mxn = 0 THEN
    IF v_prima_moneda = 'MXN' THEN
      v_prima_mxn := v_prima_input;
    ELSIF v_prima_moneda = 'USD' THEN
      SELECT tasa INTO v_fx FROM fx_usd_mxn ORDER BY fecha DESC LIMIT 1;
      v_prima_mxn := v_prima_input * COALESCE(v_fx, 20);
    ELSIF v_prima_moneda = 'UDI' THEN
      SELECT valor INTO v_udi FROM udi_values ORDER BY fecha DESC LIMIT 1;
      v_prima_mxn := v_prima_input * COALESCE(v_udi, 8);
    ELSE
      v_prima_mxn := v_prima_input;
    END IF;
  END IF;

  -- 4) Buscar threshold configurado para este tipo de producto y monto
  SELECT puntos, clasificacion
    INTO v_puntos, v_clas
  FROM puntos_thresholds
  WHERE tipo_producto = v_tipo
    AND activo = true
    AND v_prima_mxn >= umbral_min
    AND (umbral_max IS NULL OR v_prima_mxn < umbral_max)
  ORDER BY orden
  LIMIT 1;

  -- Si no encuentra threshold, usar valores por defecto
  IF NOT FOUND THEN
    -- Lógica hardcodeada como fallback
    IF v_tipo = 'GMM' THEN
      IF v_prima_mxn >= 7500 THEN
        v_puntos := 0.5;
        v_clas := 'MEDIO';
      ELSE
        v_puntos := 0;
        v_clas := 'CERO';
      END IF;
    ELSIF v_tipo = 'VI' THEN
      IF v_prima_mxn >= 150000 THEN
        v_puntos := 3;
        v_clas := 'TRIPLE';
      ELSIF v_prima_mxn >= 50000 THEN
        v_puntos := 2;
        v_clas := 'DOBLE';
      ELSIF v_prima_mxn >= 15000 THEN
        v_puntos := 1;
        v_clas := 'SIMPLE';
      ELSE
        v_puntos := 0;
        v_clas := 'CERO';
      END IF;
    ELSE
      v_puntos := 0;
      v_clas := 'CERO';
    END IF;
  END IF;

  -- 5) Calcular año de vigencia
  v_year := GREATEST(1, (EXTRACT(YEAR FROM age(CURRENT_DATE, v_fecha_emision))::int + 1));

  -- 6) Obtener factor de año del producto_parametro
  SELECT
    CASE v_year
      WHEN 1 THEN COALESCE(anio_1_percent, 100)
      WHEN 2 THEN COALESCE(anio_2_percent, 100)
      WHEN 3 THEN COALESCE(anio_3_percent, 100)
      WHEN 4 THEN COALESCE(anio_4_percent, 100)
      WHEN 5 THEN COALESCE(anio_5_percent, 100)
      WHEN 6 THEN COALESCE(anio_6_percent, 100)
      WHEN 7 THEN COALESCE(anio_7_percent, 100)
      WHEN 8 THEN COALESCE(anio_8_percent, 100)
      WHEN 9 THEN COALESCE(anio_9_percent, 100)
      WHEN 10 THEN COALESCE(anio_10_percent, 100)
      ELSE COALESCE(anio_11_plus_percent, 0)
    END / 100.0
    INTO v_base_factor
  FROM producto_parametros
  WHERE id = v_pp_id;

  v_base_factor := COALESCE(v_base_factor, 1.0);

  -- Aplicar factor de año a los puntos
  v_puntos := v_puntos * v_base_factor;

  <<finalize>>
  -- 7) Guardar en cache
  INSERT INTO poliza_puntos_cache (
    poliza_id, puntos_total, clasificacion, base_factor, producto_factor, year_factor,
    prima_anual_snapshot, producto_parametro_id, udi_valor, usd_fx,
    breakdown, recalculo_reason, computed_at, updated_at
  )
  SELECT p.id, v_puntos, v_clas, v_base_factor, 1.0, v_base_factor,
         p.prima_mxn, p.producto_parametro_id, v_udi, v_fx,
         jsonb_build_object('year', v_year, 'factor', v_base_factor),
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
    computed_at = EXCLUDED.computed_at,
    updated_at = EXCLUDED.updated_at;

  -- 8) Denormalizar en polizas
  UPDATE polizas
  SET clasificacion_actual = v_clas,
      puntos_actuales = v_puntos,
      updated_at = now()
  WHERE id = p_poliza_id;
END;
$$;

-- Verificación final
SELECT 'Migraciones aplicadas exitosamente' as status;

-- Mostrar configuración actual
SELECT tipo_producto, umbral_min, umbral_max, puntos, clasificacion, descripcion, orden
FROM puntos_thresholds
WHERE activo = true
ORDER BY tipo_producto, orden;
