-- Verificar reglas actuales de Reto 5000
SELECT 
  id, 
  scope, 
  priority, 
  rule_kind, 
  LEFT(description, 50) as description_preview,
  config::text as config_preview
FROM campaign_rules 
WHERE campaign_id = (SELECT id FROM campaigns WHERE slug = 'reto-5000')
ORDER BY scope, priority;

-- Si falta la regla TENURE_MONTHS, descomentar y ejecutar lo siguiente:
/*
-- Primero, obtener el campaign_id
DO $$
DECLARE
  v_campaign_id UUID;
BEGIN
  SELECT id INTO v_campaign_id FROM campaigns WHERE slug = 'reto-5000';
  
  -- Verificar si ya existe TENURE_MONTHS
  IF NOT EXISTS (
    SELECT 1 FROM campaign_rules 
    WHERE campaign_id = v_campaign_id AND rule_kind = 'TENURE_MONTHS'
  ) THEN
    -- Insertar la regla TENURE_MONTHS si no existe
    INSERT INTO campaign_rules (
      campaign_id, 
      scope, 
      priority, 
      rule_kind, 
      config, 
      description
    ) VALUES (
      v_campaign_id,
      'eligibility',
      0,
      'TENURE_MONTHS',
      '{"min": 25, "role": "asesor"}'::jsonb,
      'Asesores PF = profesionales/consolidados con al menos 25 meses desde su conexión'
    );
    
    RAISE NOTICE 'Regla TENURE_MONTHS insertada exitosamente';
  ELSE
    RAISE NOTICE 'Regla TENURE_MONTHS ya existe';
  END IF;
END $$;
*/
