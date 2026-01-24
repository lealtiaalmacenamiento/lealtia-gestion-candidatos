-- Script para corregir pagos duplicados en pólizas anuales
-- Ejecutar en Supabase SQL Editor

-- 1. Verificar pólizas anuales con más de 1 pago
SELECT 
  p.numero_poliza,
  p.periodicidad_pago,
  p.fecha_emision,
  COUNT(ppm.id) as total_pagos,
  COUNT(CASE WHEN ppm.estado = 'pagado' THEN 1 END) as pagos_pagados,
  STRING_AGG(ppm.periodo_mes::text, ', ' ORDER BY ppm.periodo_mes) as periodos
FROM polizas p
LEFT JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
WHERE p.periodicidad_pago = 'anual'
  AND p.anulada_at IS NULL
GROUP BY p.id, p.numero_poliza, p.periodicidad_pago, p.fecha_emision
HAVING COUNT(ppm.id) > 1
ORDER BY p.numero_poliza;

-- 2. Para cada póliza anual con pagos duplicados, mantener solo el primer periodo
-- y eliminar los demás (excepto los que ya están pagados)
DO $$
DECLARE
  r RECORD;
  primer_periodo DATE;
  pagos_a_eliminar INT;
BEGIN
  FOR r IN 
    SELECT 
      p.id as poliza_id,
      p.numero_poliza,
      MIN(ppm.periodo_mes) as primer_periodo
    FROM polizas p
    INNER JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
    WHERE p.periodicidad_pago = 'anual'
      AND p.anulada_at IS NULL
    GROUP BY p.id, p.numero_poliza
    HAVING COUNT(ppm.id) > 1
  LOOP
    -- Eliminar pagos que NO sean el primer periodo y que NO estén pagados
    DELETE FROM poliza_pagos_mensuales
    WHERE poliza_id = r.poliza_id
      AND periodo_mes != r.primer_periodo
      AND estado != 'pagado';
    
    GET DIAGNOSTICS pagos_a_eliminar = ROW_COUNT;
    
    RAISE NOTICE 'Póliza %: eliminados % pagos duplicados, manteniendo periodo %', 
      r.numero_poliza, pagos_a_eliminar, r.primer_periodo;
  END LOOP;
END $$;

-- 3. Verificar el resultado
SELECT 
  p.numero_poliza,
  p.periodicidad_pago,
  COUNT(ppm.id) as total_pagos,
  COUNT(CASE WHEN ppm.estado = 'pagado' THEN 1 END) as pagos_pagados,
  STRING_AGG(ppm.periodo_mes::text, ', ' ORDER BY ppm.periodo_mes) as periodos
FROM polizas p
LEFT JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id
WHERE p.periodicidad_pago = 'anual'
  AND p.anulada_at IS NULL
GROUP BY p.id, p.numero_poliza, p.periodicidad_pago
ORDER BY p.numero_poliza;
