-- Ajuste: comisiones dashboard debe reflejar pagos marcados como pagados en poliza_pagos_mensuales
-- Fecha: 2026-01-05
-- Nota: recalcula vw_comisiones_agente_mes para usar pagos pagados (ppm.estado = 'pagado')
--       y mantiene las vistas de dashboard sin cambiar sus columnas.

-- Vista base: comisiones por agente y mes usando pagos pagados
CREATE OR REPLACE VIEW vw_comisiones_agente_mes AS
SELECT 
  cl.asesor_id,
  u.id AS usuario_id,
  u.nombre AS agente_nombre,
  u.email AS agente_email,
  DATE_TRUNC('month', ppm.periodo_mes)::date AS mes_emision,
  TO_CHAR(DATE_TRUNC('month', ppm.periodo_mes), 'YYYY-MM') AS periodo,
  COUNT(DISTINCT p.id) AS total_polizas,
  SUM(ppm.monto_pagado) AS prima_total,
  SUM(ppm.monto_pagado * COALESCE(ppc.base_factor, 0) / 100) AS comision_estimada,
  SUM(
    CASE 
      WHEN ppm.estado = 'pagado' THEN ppm.monto_pagado * COALESCE(ppc.base_factor, 0) / 100
      ELSE 0
    END
  ) AS comision_vigente
FROM poliza_pagos_mensuales ppm
INNER JOIN polizas p ON ppm.poliza_id = p.id
INNER JOIN clientes cl ON p.cliente_id = cl.id
INNER JOIN usuarios u ON cl.asesor_id = u.id_auth
LEFT JOIN poliza_puntos_cache ppc ON p.id = ppc.poliza_id
WHERE p.anulada_at IS NULL
  AND u.rol = 'agente'
  AND u.activo = TRUE
  AND ppm.estado = 'pagado'
GROUP BY cl.asesor_id, u.id, u.nombre, u.email, DATE_TRUNC('month', ppm.periodo_mes);

COMMENT ON VIEW vw_comisiones_agente_mes IS 'Comisiones agregadas por agente y mes, usando pagos marcados como pagado y base_factor de cada póliza';
