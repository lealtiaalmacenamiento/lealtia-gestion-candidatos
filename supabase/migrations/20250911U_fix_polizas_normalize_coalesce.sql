-- Fix: evitar violación NOT NULL en polizas.prima_mxn cuando normalize_prima devuelve NULL
-- Estrategia: en el trigger polizas_normalize_amounts coalesce a valor previo o 0
-- Fecha: 2025-09-11

CREATE OR REPLACE FUNCTION polizas_normalize_amounts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prima_mxn numeric;
  v_sa_mxn numeric;
BEGIN
  -- Calcular prima_mxn con fallback
  v_prima_mxn := normalize_prima(NEW.prima_input, NEW.prima_moneda, NEW.fecha_emision);

  IF TG_OP = 'UPDATE' THEN
    NEW.prima_mxn := COALESCE(v_prima_mxn,
                               OLD.prima_mxn,
                               CASE WHEN NEW.prima_moneda = 'MXN'::moneda_poliza THEN round(NEW.prima_input, 2) END,
                               0);
  ELSE
    -- INSERT
    NEW.prima_mxn := COALESCE(v_prima_mxn,
                               CASE WHEN NEW.prima_moneda = 'MXN'::moneda_poliza THEN round(NEW.prima_input, 2) END,
                               0);
  END IF;

  -- Calcular sa_mxn (columna permite NULL)
  IF NEW.sa_input IS NOT NULL AND NEW.sa_moneda IS NOT NULL THEN
    v_sa_mxn := normalize_prima(NEW.sa_input, NEW.sa_moneda, NEW.fecha_emision);
    NEW.sa_mxn := v_sa_mxn; -- puede ser NULL y es permitido
  ELSE
    NEW.sa_mxn := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- El trigger existente ya apunta a polizas_normalize_amounts, por lo que el CREATE OR REPLACE es suficiente.
