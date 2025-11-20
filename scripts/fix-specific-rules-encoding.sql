-- Fix specific encoding issues in campaign_rules by ID
-- Replace malformed text with correct Spanish characters

-- Fix conexión in TENURE_MONTHS rule
UPDATE campaign_rules
SET description = 'Asesores PF = profesionales/consolidados con al menos 25 meses desde su conexión.'
WHERE id = '04864b9a-ab02-4efd-896b-f521f588a7ab';

-- Fix póliza in prima mínima rule
UPDATE campaign_rules
SET description = 'Al menos una póliza con prima mínima de $25,000 MXN'
WHERE id = '5b2a5a27-1191-4ea5-aae5-ebeb6ae66495';

-- Fix conexión in promotor rule
UPDATE campaign_rules
SET description = 'Promotor debe tener mes de conexión registrado.'
WHERE id = '774d6f1e-8d64-454c-92a0-68ae44dafcaf';

-- Fix póliza in Vida Grupo rule
UPDATE campaign_rules
SET description = 'Al menos una póliza Vida Grupo emitida y pagada dentro de la vigencia.'
WHERE id = 'ac874e6e-3bef-4d76-a55d-db369794b0db';

-- Verify updates
SELECT id, rule_kind, description 
FROM campaign_rules 
WHERE id IN (
  '04864b9a-ab02-4efd-896b-f521f588a7ab',
  '5b2a5a27-1191-4ea5-aae5-ebeb6ae66495',
  '774d6f1e-8d64-454c-92a0-68ae44dafcaf',
  'ac874e6e-3bef-4d76-a55d-db369794b0db'
)
ORDER BY campaign_id;
