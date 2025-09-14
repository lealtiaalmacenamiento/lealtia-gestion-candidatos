-- Fix: eliminar excepciones por falta de UDI/FX y usar fallback a último valor disponible
-- Fecha: 2025-09-11
-- Reemplaza normalize_prima para que si no hay datos en tablas udi_values / fx_values devuelva NULL (o el monto sin conversión)

CREATE OR REPLACE FUNCTION normalize_prima(p_monto numeric, p_moneda moneda_poliza, p_fecha date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
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
    SELECT get_fx_usd(COALESCE(p_fecha, CURRENT_DATE)) INTO v; -- ya con fallback
    IF v IS NULL THEN
      -- Sin datos FX: devolvemos NULL para indicar que no se pudo normalizar
      RETURN NULL;
    END IF;
    RETURN round(p_monto * v, 2);
  ELSIF p_moneda = 'UDI'::moneda_poliza THEN
    SELECT get_current_udi(COALESCE(p_fecha, CURRENT_DATE)) INTO v; -- ya con fallback
    IF v IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN round(p_monto * v, 2);
  ELSE
    RETURN round(p_monto, 2);
  END IF;
END;
$$;

-- Nota: No tocamos triggers; sólo se beneficiarán de la nueva lógica sin excepciones.
