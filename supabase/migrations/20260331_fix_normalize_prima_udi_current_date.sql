-- =============================================================================
-- Fix normalize_prima: UDI siempre usa CURRENT_DATE (no fecha_emision)
-- Motivo: prima_mxn fue calculada con proyecciones UDI del año 2091 (~207 pesos)
--         porque la póliza fue insertada antes de cargar datos reales de Banxico.
--         El usuario requiere que siempre se use el UDI vigente del día.
-- =============================================================================

-- Reemplazar normalize_prima para que UDI use siempre CURRENT_DATE
-- Necesitamos DROP + CREATE porque la firma puede tener defaults distintos
DROP FUNCTION IF EXISTS normalize_prima(numeric, moneda_poliza, date);

CREATE FUNCTION normalize_prima(p_monto numeric, p_moneda moneda_poliza, p_fecha date DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
    IF v IS NULL THEN RETURN NULL; END IF;
    RETURN round(p_monto * v, 2);
  ELSIF p_moneda = 'UDI'::moneda_poliza THEN
    -- Siempre usar el UDI del día actual para reflejar el valor vigente en MXN
    SELECT get_current_udi(CURRENT_DATE) INTO v;
    IF v IS NULL THEN RETURN NULL; END IF;
    RETURN round(p_monto * v, 2);
  ELSE
    RETURN round(p_monto, 2);
  END IF;
END;
$$;

-- =============================================================================
-- Forzar recálculo de prima_mxn para todas las pólizas UDI activas
-- Actualiza prima_mxn directamente con el UDI actual.
-- El trigger fn_generar_pagos_programados (columna prima_mxn) regenerará
-- el calendario de pagos automáticamente.
-- =============================================================================
UPDATE polizas
SET prima_mxn = round(
    prima_input * (
      SELECT valor FROM udi_values
      WHERE fecha <= CURRENT_DATE
      ORDER BY fecha DESC LIMIT 1
    ),
    2
  )
WHERE prima_moneda = 'UDI'
  AND estatus != 'ANULADA';
