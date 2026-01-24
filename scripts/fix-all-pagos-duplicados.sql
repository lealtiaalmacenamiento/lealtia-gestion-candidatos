-- Script para corregir todas las pólizas con pagos excesivos
-- Consolida pagos pagados y elimina pagos pendientes/vencidos excedentes

-- 1. Ver todas las pólizas con problemas
SELECT 
  p.numero_poliza,
  p.periodicidad_pago,
  p.fecha_emision,
  COUNT(ppm.id) as total_pagos,
  CASE 
    WHEN p.periodicidad_pago = 'anual' THEN 1
    WHEN p.periodicidad_pago = 'semestral' THEN 2
    WHEN p.periodicidad_pago = 'trimestral' THEN 4
    WHEN p.periodicidad_pago = 'mensual' THEN 12
    ELSE 0
  END as pagos_esperados,
  COUNT(CASE WHEN ppm.estado = 'pagado' THEN 1 END) as pagos_pagados,
  STRING_AGG(ppm.periodo_mes::text || ' (' || ppm.estado || ')', ', ' ORDER BY ppm.periodo_mes) as periodos
FROM polizas p
LEFT JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
WHERE p.anulada_at IS NULL
GROUP BY p.id, p.numero_poliza, p.periodicidad_pago, p.fecha_emision
HAVING (
  (p.periodicidad_pago = 'anual' AND COUNT(ppm.id) > 1) OR
  (p.periodicidad_pago = 'semestral' AND COUNT(ppm.id) > 2) OR
  (p.periodicidad_pago = 'trimestral' AND COUNT(ppm.id) > 4) OR
  (p.periodicidad_pago = 'mensual' AND COUNT(ppm.id) > 12)
)
ORDER BY p.periodicidad_pago, p.numero_poliza;

-- 2. Corregir cada póliza
DO $$
DECLARE
  r RECORD;
  pagos_esperados INT;
  periodos_a_mantener DATE[];
  pagos_consolidados INT := 0;
BEGIN
  FOR r IN 
    SELECT 
      p.id as poliza_id,
      p.numero_poliza,
      p.periodicidad_pago,
      p.fecha_emision,
      CASE 
        WHEN p.periodicidad_pago = 'anual' THEN 1
        WHEN p.periodicidad_pago = 'semestral' THEN 2
        WHEN p.periodicidad_pago = 'trimestral' THEN 4
        WHEN p.periodicidad_pago = 'mensual' THEN 12
        ELSE 1
      END as esperados,
      CASE 
        WHEN p.periodicidad_pago = 'anual' THEN 12
        WHEN p.periodicidad_pago = 'semestral' THEN 6
        WHEN p.periodicidad_pago = 'trimestral' THEN 3
        WHEN p.periodicidad_pago = 'mensual' THEN 1
        ELSE 12
      END as step_months
    FROM polizas p
    WHERE p.anulada_at IS NULL
      AND (
        (p.periodicidad_pago = 'anual' AND (SELECT COUNT(*) FROM poliza_pagos_mensuales WHERE poliza_id = p.id) > 1) OR
        (p.periodicidad_pago = 'semestral' AND (SELECT COUNT(*) FROM poliza_pagos_mensuales WHERE poliza_id = p.id) > 2) OR
        (p.periodicidad_pago = 'trimestral' AND (SELECT COUNT(*) FROM poliza_pagos_mensuales WHERE poliza_id = p.id) > 4) OR
        (p.periodicidad_pago = 'mensual' AND (SELECT COUNT(*) FROM poliza_pagos_mensuales WHERE poliza_id = p.id) > 12)
      )
  LOOP
    pagos_esperados := r.esperados;
    
    -- Determinar los periodos correctos basados en fecha_emision
    SELECT ARRAY(
      SELECT DATE_TRUNC('month', r.fecha_emision + (i * INTERVAL '1 month' * r.step_months))::DATE
      FROM generate_series(0, pagos_esperados - 1) i
    ) INTO periodos_a_mantener;
    
    -- Para cada periodo esperado, consolidar o crear
    FOR i IN 1..pagos_esperados LOOP
      DECLARE
        periodo_target DATE := periodos_a_mantener[i];
        pago_existente RECORD;
        total_pagado NUMERIC;
      BEGIN
        -- Buscar si ya existe un pago en este periodo
        SELECT * INTO pago_existente 
        FROM poliza_pagos_mensuales 
        WHERE poliza_id = r.poliza_id 
          AND periodo_mes = periodo_target
        LIMIT 1;
        
        IF pago_existente.id IS NOT NULL THEN
          -- Ya existe, consolidar montos de pagos duplicados del mismo mes
          SELECT COALESCE(SUM(monto_pagado), 0) INTO total_pagado
          FROM poliza_pagos_mensuales
          WHERE poliza_id = r.poliza_id
            AND periodo_mes = periodo_target;
          
          -- Solo actualizar si total_pagado > 0 para evitar violación del constraint
          IF total_pagado > 0 THEN
            UPDATE poliza_pagos_mensuales
            SET monto_pagado = total_pagado
            WHERE id = pago_existente.id;
          END IF;
          
          -- Eliminar duplicados del mismo periodo
          DELETE FROM poliza_pagos_mensuales
          WHERE poliza_id = r.poliza_id
            AND periodo_mes = periodo_target
            AND id != pago_existente.id;
        END IF;
      END;
    END LOOP;
    
    -- Eliminar pagos que no corresponden a ningún periodo esperado
    DELETE FROM poliza_pagos_mensuales
    WHERE poliza_id = r.poliza_id
      AND periodo_mes != ALL(periodos_a_mantener);
    
    GET DIAGNOSTICS pagos_consolidados = ROW_COUNT;
    
    RAISE NOTICE 'Póliza % (%): corregida a % pagos, eliminados % registros incorrectos', 
      r.numero_poliza, r.periodicidad_pago, pagos_esperados, pagos_consolidados;
  END LOOP;
END $$;

-- 3. Verificar el resultado
SELECT 
  p.numero_poliza,
  p.periodicidad_pago,
  p.fecha_emision,
  COUNT(ppm.id) as total_pagos,
  CASE 
    WHEN p.periodicidad_pago = 'anual' THEN 1
    WHEN p.periodicidad_pago = 'semestral' THEN 2
    WHEN p.periodicidad_pago = 'trimestral' THEN 4
    WHEN p.periodicidad_pago = 'mensual' THEN 12
    ELSE 0
  END as pagos_esperados,
  COUNT(CASE WHEN ppm.estado = 'pagado' THEN 1 END) as pagos_pagados,
  STRING_AGG(ppm.periodo_mes::text || ' (' || ppm.estado || ', $' || COALESCE(ppm.monto_pagado, 0) || ')', ', ' ORDER BY ppm.periodo_mes) as periodos
FROM polizas p
LEFT JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
WHERE p.anulada_at IS NULL
  AND p.periodicidad_pago IN ('anual', 'semestral', 'trimestral', 'mensual')
GROUP BY p.id, p.numero_poliza, p.periodicidad_pago, p.fecha_emision
ORDER BY p.periodicidad_pago, p.numero_poliza
LIMIT 50;
