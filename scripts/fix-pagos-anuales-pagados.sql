-- Script para corregir pagos duplicados en pólizas anuales
-- INCLUYE pagos que están marcados como pagados
-- Mantiene solo el pago más cercano a la fecha de emisión

-- 1. Ver el problema actual
SELECT 
  p.numero_poliza,
  p.periodicidad_pago,
  p.fecha_emision,
  ppm.periodo_mes,
  ppm.estado,
  ppm.monto_pagado,
  ppm.id as pago_id
FROM polizas p
INNER JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
WHERE p.periodicidad_pago = 'anual'
  AND p.anulada_at IS NULL
ORDER BY p.numero_poliza, ppm.periodo_mes;

-- 2. Para cada póliza anual con múltiples pagos, mantener solo el más cercano a fecha_emision
DO $$
DECLARE
  r RECORD;
  periodo_a_mantener DATE;
  pagos_eliminados INT := 0;
BEGIN
  FOR r IN 
    SELECT 
      p.id as poliza_id,
      p.numero_poliza,
      p.fecha_emision,
      (SELECT ppm.periodo_mes 
       FROM poliza_pagos_mensuales ppm 
       WHERE ppm.poliza_id = p.id 
       ORDER BY ABS(EXTRACT(EPOCH FROM (ppm.periodo_mes::timestamp - p.fecha_emision::timestamp)))
       LIMIT 1) as periodo_cercano
    FROM polizas p
    WHERE p.periodicidad_pago = 'anual'
      AND p.anulada_at IS NULL
      AND (SELECT COUNT(*) FROM poliza_pagos_mensuales ppm WHERE ppm.poliza_id = p.id) > 1
  LOOP
    -- Sumar los montos pagados de todos los pagos que se eliminarán
    UPDATE poliza_pagos_mensuales
    SET monto_pagado = (
      SELECT COALESCE(SUM(monto_pagado), 0)
      FROM poliza_pagos_mensuales
      WHERE poliza_id = r.poliza_id
    )
    WHERE poliza_id = r.poliza_id
      AND periodo_mes = r.periodo_cercano;
    
    -- Eliminar los otros pagos
    DELETE FROM poliza_pagos_mensuales
    WHERE poliza_id = r.poliza_id
      AND periodo_mes != r.periodo_cercano;
    
    GET DIAGNOSTICS pagos_eliminados = ROW_COUNT;
    
    RAISE NOTICE 'Póliza %: consolidados % pagos en periodo % (cerca de emisión %)', 
      r.numero_poliza, pagos_eliminados + 1, r.periodo_cercano, r.fecha_emision;
  END LOOP;
END $$;

-- 3. Verificar el resultado
SELECT 
  p.numero_poliza,
  p.periodicidad_pago,
  p.fecha_emision,
  COUNT(ppm.id) as total_pagos,
  COUNT(CASE WHEN ppm.estado = 'pagado' THEN 1 END) as pagos_pagados,
  STRING_AGG(ppm.periodo_mes::text || ' ($' || COALESCE(ppm.monto_pagado, 0) || ')', ', ' ORDER BY ppm.periodo_mes) as periodos_y_montos
FROM polizas p
LEFT JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
WHERE p.periodicidad_pago = 'anual'
  AND p.anulada_at IS NULL
GROUP BY p.id, p.numero_poliza, p.periodicidad_pago, p.fecha_emision
ORDER BY p.numero_poliza;
