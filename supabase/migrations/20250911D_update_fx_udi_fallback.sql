-- Migration: make FX / UDI lookup always fallback to valor ACTUAL (último disponible)
-- Fecha: 2025-09-11
-- Objetivo: eliminar error "No UDI value found for <fecha> or earlier" cuando no hay dato histórico
-- Estrategia: redefinir get_current_udi y get_fx_usd para usar primero valor <= fecha y si no existe, usar el más reciente.

CREATE OR REPLACE FUNCTION get_current_udi(p_fecha date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v numeric;
BEGIN
  -- Intentar valor histórico (<= fecha)
  SELECT valor INTO v
  FROM udi_values
  WHERE fecha <= COALESCE(p_fecha, CURRENT_DATE)
  ORDER BY fecha DESC
  LIMIT 1;

  -- Fallback: valor más reciente disponible (actual)
  IF v IS NULL THEN
    SELECT valor INTO v FROM udi_values ORDER BY fecha DESC LIMIT 1;
  END IF;

  RETURN v; -- puede ser NULL si la tabla está vacía
END;
$$;

CREATE OR REPLACE FUNCTION get_fx_usd(p_fecha date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v numeric;
BEGIN
  SELECT valor INTO v
  FROM fx_values
  WHERE fecha <= COALESCE(p_fecha, CURRENT_DATE)
  ORDER BY fecha DESC
  LIMIT 1;

  IF v IS NULL THEN
    SELECT valor INTO v FROM fx_values ORDER BY fecha DESC LIMIT 1;
  END IF;

  RETURN v;
END;
$$;

-- Nota: normalize_prima existente ahora heredará el fallback implícito y dejará de lanzar excepción.
-- No recalculamos valores persistidos para conservar historial; la vista polizas_valores_actuales ya ofrece valores actuales.