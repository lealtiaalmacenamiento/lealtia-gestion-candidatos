-- Ajuste: incluir supervisores en dashboards de comisiones
-- Fecha: 2026-01-05
-- Nota: amplía rol a ('agente','supervisor') en vistas de comisiones y agentes con/sin mes de conexión.

-- Vista: Agentes (y supervisores) con mes de conexión
CREATE OR REPLACE VIEW vw_agentes_con_mes_conexion AS
SELECT 
  u.id AS usuario_id,
  u.id_auth,
  u.email,
  u.nombre AS agente_nombre,
  c.mes_conexion,
  c.candidato,
  c.efc
FROM usuarios u
INNER JOIN candidatos c ON LOWER(c.email_agente) = LOWER(u.email)
WHERE u.rol IN ('agente','supervisor')
  AND u.activo = TRUE
  AND c.eliminado = FALSE
  AND c.mes_conexion IS NOT NULL;

COMMENT ON VIEW vw_agentes_con_mes_conexion IS 'Agentes y supervisores con mes de conexión registrado en candidatos';

-- Vista: Agentes (y supervisores) sin mes de conexión
CREATE OR REPLACE VIEW vw_agentes_sin_mes_conexion AS
SELECT 
  u.id AS usuario_id,
  u.id_auth,
  u.email,
  u.nombre AS agente_nombre
FROM usuarios u
WHERE u.rol IN ('agente','supervisor')
  AND u.activo = TRUE
  AND NOT EXISTS (
    SELECT 1 
    FROM candidatos c 
    WHERE LOWER(c.email_agente) = LOWER(u.email)
      AND c.eliminado = FALSE
      AND c.mes_conexion IS NOT NULL
  );

COMMENT ON VIEW vw_agentes_sin_mes_conexion IS 'Agentes y supervisores que NO tienen mes de conexión en candidatos';

-- Vista base: comisiones por rol agente/supervisor y mes usando pagos pagados
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
  AND u.rol IN ('agente','supervisor')
  AND u.activo = TRUE
  AND ppm.estado = 'pagado'
GROUP BY cl.asesor_id, u.id, u.nombre, u.email, DATE_TRUNC('month', ppm.periodo_mes);

COMMENT ON VIEW vw_comisiones_agente_mes IS 'Comisiones agregadas por agente/supervisor y mes, usando pagos marcados como pagado y base_factor de cada póliza';
