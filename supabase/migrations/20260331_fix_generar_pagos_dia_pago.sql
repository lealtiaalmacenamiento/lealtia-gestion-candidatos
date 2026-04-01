-- =====================================================================
-- MIGRACIÓN: Corrección de fn_generar_pagos_programados
-- Fecha: 2026-03-31
-- Problemas resueltos:
--   1. Bug crítico: (dia_pago - 1) se multiplicaba por INTERVAL '1 month'
--      en vez de INTERVAL '1 day', generando pagos con dos años de adelanto
--      (ej. dia_pago=25 → primer pago en 2027 en lugar de 2025).
--   2. Trigger disparaba aunque el estatus fuera ANULADA, causando error
--      "time zone displacement out of range" al guardar polizas anuladas.
--   3. Se usa make_interval() en vez de concatenación de texto para construir
--      intervalos, lo que es más seguro y predecible.
--   4. Se respeta fecha_renovacion como límite para no generar pagos más allá
--      del período vigente de la póliza.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_generar_pagos_programados()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_divisor             integer;
  v_monto_periodo       numeric(14,2);
  v_meses_entre_pagos   integer;
  v_fecha_primer_pago   date;
  v_fecha_limite        date;
  v_idx                 integer;
  v_offset              interval;
  v_periodo             date;
  v_fecha_prog          date;
  v_fecha_limite_calc   date;
  v_end_date            date;
BEGIN
  -- No generar pagos si la póliza está anulada
  IF NEW.estatus = 'ANULADA' THEN
    RETURN NEW;
  END IF;

  -- Datos mínimos requeridos
  IF NEW.periodicidad_pago IS NULL OR NEW.prima_mxn IS NULL OR NEW.prima_mxn <= 0 THEN
    RETURN NEW;
  END IF;

  CASE NEW.periodicidad_pago
    WHEN 'mensual' THEN
      v_divisor := 12;
      v_meses_entre_pagos := 1;
    WHEN 'trimestral' THEN
      v_divisor := 4;
      v_meses_entre_pagos := 3;
    WHEN 'semestral' THEN
      v_divisor := 2;
      v_meses_entre_pagos := 6;
    WHEN 'anual' THEN
      v_divisor := 1;
      v_meses_entre_pagos := 12;
    ELSE
      RETURN NEW;
  END CASE;

  v_monto_periodo := ROUND(NEW.prima_mxn / v_divisor, 2);

  -- CORRECCIÓN: usar días para el dia_pago, no meses
  -- Primer pago = primer día del mes de emisión + (dia_pago - 1) días
  v_fecha_primer_pago := DATE_TRUNC('month', NEW.fecha_emision)::date
    + make_interval(days := CASE WHEN NEW.dia_pago IS NOT NULL THEN GREATEST(NEW.dia_pago - 1, 0) ELSE 0 END);

  v_fecha_limite := COALESCE(
    NEW.fecha_limite_pago,
    (DATE_TRUNC('month', v_fecha_primer_pago) + INTERVAL '1 month' - INTERVAL '1 day')::date
  );

  -- Determinar fecha de corte para no generar pagos más allá de la renovación
  v_end_date := CASE
    WHEN NEW.fecha_renovacion IS NOT NULL
      THEN DATE_TRUNC('month', NEW.fecha_renovacion)::date
    ELSE
      (DATE_TRUNC('month', v_fecha_primer_pago) + make_interval(months := v_divisor * v_meses_entre_pagos))::date
  END;

  -- Eliminar sólo pagos pendientes; preservar pagado y omitido
  DELETE FROM poliza_pagos_mensuales
  WHERE poliza_id = NEW.id
    AND estado = 'pendiente';

  FOR v_idx IN 0..(v_divisor - 1) LOOP
    -- CORRECCIÓN: usar make_interval para construir el offset de meses
    v_offset := make_interval(months := v_idx * v_meses_entre_pagos);
    v_periodo          := (DATE_TRUNC('month', v_fecha_primer_pago) + v_offset)::date;
    v_fecha_prog       := (v_fecha_primer_pago + v_offset)::date;
    v_fecha_limite_calc := (v_fecha_limite + v_offset)::date;

    -- Respetar el límite de fecha de renovación
    EXIT WHEN v_periodo >= v_end_date;

    INSERT INTO poliza_pagos_mensuales (
      poliza_id,
      periodo_mes,
      fecha_programada,
      fecha_limite,
      monto_programado,
      estado,
      created_by
    ) VALUES (
      NEW.id,
      v_periodo,
      v_fecha_prog,
      v_fecha_limite_calc,
      v_monto_periodo,
      'pendiente',
      NEW.creado_por
    )
    ON CONFLICT (poliza_id, periodo_mes) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Re-registrar el trigger con la misma definición
-- (se conserva la condición WHEN para evitar disparos innecesarios)
DROP TRIGGER IF EXISTS trg_polizas_generar_pagos ON polizas;
CREATE TRIGGER trg_polizas_generar_pagos
  AFTER INSERT OR UPDATE OF periodicidad_pago, fecha_limite_pago, prima_mxn, fecha_emision, dia_pago
  ON polizas
  FOR EACH ROW
  WHEN (NEW.periodicidad_pago IS NOT NULL AND NEW.estatus != 'ANULADA')
  EXECUTE FUNCTION fn_generar_pagos_programados();
