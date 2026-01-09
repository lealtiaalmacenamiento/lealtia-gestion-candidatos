-- Ajuste: excluir mes_conexion vacío ('') de la vista con conexión
-- Fecha: 2026-01-05

-- Vista: Agentes/supervisores con mes de conexión (no null y no vacío)
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
  AND c.mes_conexion IS NOT NULL
  AND c.mes_conexion <> '';

COMMENT ON VIEW vw_agentes_con_mes_conexion IS 'Agentes y supervisores con mes de conexión registrado en candidatos (no vacío)';

-- Vista: Agentes/supervisores sin mes de conexión (considera nulo o vacío como sin conexión)
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
      AND c.mes_conexion <> ''
  );

COMMENT ON VIEW vw_agentes_sin_mes_conexion IS 'Agentes y supervisores que no tienen mes de conexión (nulo o vacío)';
