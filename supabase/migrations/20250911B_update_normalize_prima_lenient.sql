-- Migration: make normalize_prima lenient (no exception on missing FX/UDI) and fallback to earliest UDI
-- Date: 2025-09-11B
-- Safe approach: only replace normalize_prima; keep get_current_udi logic but wrap usage.

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
    BEGIN
      SELECT get_fx_usd(COALESCE(p_fecha, CURRENT_DATE)) INTO v;
    EXCEPTION WHEN OTHERS THEN
      v := NULL;
    END;
    IF v IS NULL THEN RETURN NULL; END IF;
    RETURN round(p_monto * v, 2);
  ELSIF p_moneda = 'UDI'::moneda_poliza THEN
    BEGIN
      SELECT get_current_udi(COALESCE(p_fecha, CURRENT_DATE)) INTO v;
    EXCEPTION WHEN OTHERS THEN
      v := NULL;
    END;
    IF v IS NULL THEN
      -- fallback: earliest available UDI
      SELECT valor INTO v FROM udi_values ORDER BY fecha ASC LIMIT 1;
    END IF;
    IF v IS NULL THEN RETURN NULL; END IF;
    RETURN round(p_monto * v, 2);
  ELSE
    RETURN round(p_monto, 2);
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;
