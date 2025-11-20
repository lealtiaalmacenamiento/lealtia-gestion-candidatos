-- Sincronizar campaña Reto 5000 con el JSON (campaigns_2025.json)
-- Esta migración elimina las reglas actuales y las reemplaza con las correctas del JSON

-- 1. Eliminar todas las reglas actuales de Reto 5000
DELETE FROM campaign_rules 
WHERE campaign_id = (SELECT id FROM campaigns WHERE slug = 'reto-5000');

-- 2. Insertar las reglas correctas según el JSON

-- Regla 1: TENURE_MONTHS (eligibility, priority 0)
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  id,
  'eligibility',
  'TENURE_MONTHS',
  jsonb_build_object(
    'min_months', 25,
    'role', 'asesor'
  ),
  0,
  'Asesores PF = profesionales/consolidados con al menos 25 meses desde su conexión.',
  NULL,
  NULL
FROM campaigns WHERE slug = 'reto-5000';

-- Regla 2: Mes de conexión (eligibility, priority 1)
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  id,
  'eligibility',
  'METRIC_CONDITION',
  jsonb_build_object(
    'dataset', 'candidatos',
    'field', 'ultimo_mes_conexion',
    'operator', 'neq',
    'value', '',
    'valueType', 'text',
    'path', ARRAY['candidatos', 'ultimo_mes_conexion'],
    'metric', 'ultimo_mes_conexion',
    'source', 'candidatos',
    'valueRaw', ''
  ),
  1,
  'Promotor debe tener mes de conexión registrado.',
  NULL,
  NULL
FROM campaigns WHERE slug = 'reto-5000';

-- Regla 3: Prima mínima (eligibility, priority 2)
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  id,
  'eligibility',
  'METRIC_CONDITION',
  jsonb_build_object(
    'dataset', 'polizas_prima_minima',
    'field', 'cantidad',
    'operator', 'gte',
    'valueType', 'number',
    'value', 1,
    'prima_minima_mxn', 25000,
    'path', ARRAY['datasets', 'polizas_prima_minima', 'cantidad'],
    'metric', 'cantidad',
    'source', 'polizas_prima_minima',
    'valueRaw', '1'
  ),
  2,
  'Al menos una póliza con prima mínima de $25,000 MXN',
  1,
  'AND'
FROM campaigns WHERE slug = 'reto-5000';

-- Regla 4: Póliza reciente (eligibility, priority 3)
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  id,
  'eligibility',
  'METRIC_CONDITION',
  jsonb_build_object(
    'dataset', 'polizas_recientes',
    'field', 'cantidad',
    'operator', 'gte',
    'valueType', 'number',
    'value', 1,
    'dias_ventana', 365,
    'path', ARRAY['datasets', 'polizas_recientes', 'cantidad'],
    'metric', 'cantidad',
    'source', 'polizas_recientes',
    'valueRaw', '1'
  ),
  3,
  'Póliza emitida recientemente (sin historial previo en 12 meses)',
  1,
  'AND'
FROM campaigns WHERE slug = 'reto-5000';

-- Regla 5: Meta de pólizas Vida Grupo (goal, priority 0)
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  id,
  'goal',
  'COUNT_POLICIES',
  jsonb_build_object(
    'product', 'vida_grupo',
    'min', 1
  ),
  0,
  'Al menos una póliza Vida Grupo emitida y pagada dentro de la vigencia.',
  NULL,
  NULL
FROM campaigns WHERE slug = 'reto-5000';

-- Verificación: Mostrar las reglas actualizadas
SELECT 
  priority,
  scope,
  rule_kind,
  description,
  config->>'dataset' as dataset,
  config->>'field' as field,
  config->>'operator' as operator,
  config->>'value' as value,
  config->>'prima_minima_mxn' as prima_minima,
  config->>'dias_ventana' as dias_ventana,
  logical_group,
  logical_operator
FROM campaign_rules 
WHERE campaign_id = (SELECT id FROM campaigns WHERE slug = 'reto-5000')
ORDER BY scope, priority;
