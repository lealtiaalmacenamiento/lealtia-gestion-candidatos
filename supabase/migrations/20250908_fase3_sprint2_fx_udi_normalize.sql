-- Fase 3 – Sprint 2: Monedas y normalización de primas/SA
-- Fecha: 2025-09-08
-- Objetivo: funciones de UDI/FX, normalización a MXN y triggers en polizas

-- Función: obtener UDI vigente (<= fecha)
CREATE OR REPLACE FUNCTION get_current_udi(p_fecha date)
RETURNS numeric
AS $$
  SELECT valor
  FROM udi_values
  WHERE fecha <= COALESCE(p_fecha, CURRENT_DATE)
  ORDER BY fecha DESC
  LIMIT 1
$$ LANGUAGE sql STABLE;

-- Función: obtener FX USD/MXN vigente (<= fecha)
CREATE OR REPLACE FUNCTION get_fx_usd(p_fecha date)
RETURNS numeric
AS $$
  SELECT valor
  FROM fx_values
  WHERE fecha <= COALESCE(p_fecha, CURRENT_DATE)
  ORDER BY fecha DESC
  LIMIT 1
$$ LANGUAGE sql STABLE;

-- Normaliza un monto a MXN según moneda y fecha (usa fecha_emision por defecto)
CREATE OR REPLACE FUNCTION normalize_prima(p_monto numeric, p_moneda moneda_poliza, p_fecha date)
RETURNS numeric
AS $$
DECLARE
  v numeric;
BEGIN
  IF p_monto IS NULL OR p_moneda IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_moneda = 'MXN'::moneda_poliza THEN
    RETURN round(p_monto, 2);
  ELSIF p_moneda = 'USD'::moneda_poliza THEN
    SELECT get_fx_usd(COALESCE(p_fecha, CURRENT_DATE)) INTO v;
    IF v IS NULL THEN
      RAISE EXCEPTION 'No FX (USD/MXN) found for % or earlier', p_fecha;
    END IF;
    RETURN round(p_monto * v, 2);
  ELSIF p_moneda = 'UDI'::moneda_poliza THEN
    SELECT get_current_udi(COALESCE(p_fecha, CURRENT_DATE)) INTO v;
    IF v IS NULL THEN
      RAISE EXCEPTION 'No UDI value found for % or earlier', p_fecha;
    END IF;
    RETURN round(p_monto * v, 2);
  ELSE
    -- Por si se agrega moneda futura; devolvemos monto sin cambio
    RETURN round(p_monto, 2);
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger function: normaliza importes en polizas
CREATE OR REPLACE FUNCTION polizas_normalize_amounts()
RETURNS trigger
AS $$
BEGIN
  NEW.prima_mxn := normalize_prima(NEW.prima_input, NEW.prima_moneda, NEW.fecha_emision);

  IF NEW.sa_input IS NOT NULL AND NEW.sa_moneda IS NOT NULL THEN
    NEW.sa_mxn := normalize_prima(NEW.sa_input, NEW.sa_moneda, NEW.fecha_emision);
  ELSE
    NEW.sa_mxn := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear/actualizar trigger en polizas
DROP TRIGGER IF EXISTS trg_polizas_normalize_amounts ON polizas;
CREATE TRIGGER trg_polizas_normalize_amounts
BEFORE INSERT OR UPDATE OF prima_input, prima_moneda, sa_input, sa_moneda, fecha_emision
ON polizas
FOR EACH ROW EXECUTE FUNCTION polizas_normalize_amounts();

-- Seeds mínimos (idempotentes) para permitir pruebas
INSERT INTO udi_values(fecha, valor, source, fetched_at, stale)
SELECT d, 7.500000::numeric, 'seed', now(), false
FROM (SELECT CURRENT_DATE::date AS d) s
ON CONFLICT (fecha) DO NOTHING;

INSERT INTO fx_values(fecha, valor, source, fetched_at, stale)
SELECT d, 17.000000::numeric, 'seed', now(), false
FROM (SELECT CURRENT_DATE::date AS d) s
ON CONFLICT (fecha) DO NOTHING;
