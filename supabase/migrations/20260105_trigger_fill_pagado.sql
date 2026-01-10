-- Trigger: auto-fill monto_pagado y fecha_pago_real al marcar como pagado
-- Fecha: 2026-01-05

CREATE OR REPLACE FUNCTION trg_fill_pagado_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.estado = 'pagado' THEN
    IF NEW.monto_pagado IS NULL THEN
      NEW.monto_pagado := COALESCE(NEW.monto_programado, 0);
    END IF;
    IF NEW.fecha_pago_real IS NULL THEN
      NEW.fecha_pago_real := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_poliza_pagos_fill_pagado ON poliza_pagos_mensuales;
CREATE TRIGGER trg_poliza_pagos_fill_pagado
  BEFORE UPDATE ON poliza_pagos_mensuales
  FOR EACH ROW
  WHEN (OLD.estado IS DISTINCT FROM NEW.estado OR NEW.monto_pagado IS NULL OR NEW.fecha_pago_real IS NULL)
  EXECUTE FUNCTION trg_fill_pagado_fields();
