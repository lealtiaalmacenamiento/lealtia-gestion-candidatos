-- Direct fix with correct UTF-8 text for all problematic campaign_rules

-- Fix: "conexión" (replace Ã³ with ó)
UPDATE campaign_rules SET description = 'Asesores PF = profesionales/consolidados con al menos 25 meses desde su conexión.' WHERE id = '04864b9a-ab02-4efd-896b-f521f588a7ab';

-- Fix: "póliza" and "mínima" 
UPDATE campaign_rules SET description = 'Al menos una póliza con prima mínima de $25,000 MXN' WHERE id = '5b2a5a27-1191-4ea5-aae5-ebeb6ae66495';

-- Fix: "conexión"
UPDATE campaign_rules SET description = 'Promotor debe tener mes de conexión registrado.' WHERE id = '774d6f1e-8d64-454c-92a0-68ae44dafcaf';

-- Fix: "póliza"
UPDATE campaign_rules SET description = 'Al menos una póliza Vida Grupo emitida y pagada dentro de la vigencia.' WHERE id = 'ac874e6e-3bef-4d76-a55d-db369794b0db';

-- Also check and fix any other rules with encoding issues
UPDATE campaign_rules SET description = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
  description,
  'Ã³', 'ó'),
  'Ã±', 'ñ'),
  'Ã¡', 'á'),
  'Ã©', 'é'),
  'Ã­', 'í'),
  'Ãº', 'ú')
WHERE description LIKE '%Ã%';

-- Fix in campaigns table too
UPDATE campaigns SET description = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
  description,
  'Ã³', 'ó'),
  'Ã±', 'ñ'),
  'Ã¡', 'á'),
  'Ã©', 'é'),
  'Ã­', 'í'),
  'Ãº', 'ú')
WHERE description LIKE '%Ã%';

UPDATE campaigns SET name = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
  name,
  'Ã³', 'ó'),
  'Ã±', 'ñ'),
  'Ã¡', 'á'),
  'Ã©', 'é'),
  'Ã­', 'í'),
  'Ãº', 'ú')
WHERE name LIKE '%Ã%';

-- Show results
\echo '\n=== Fixed campaign_rules ==='
SELECT id, LEFT(description, 80) as description FROM campaign_rules WHERE id IN (
  '04864b9a-ab02-4efd-896b-f521f588a7ab',
  '5b2a5a27-1191-4ea5-aae5-ebeb6ae66495',
  '774d6f1e-8d64-454c-92a0-68ae44dafcaf',
  'ac874e6e-3bef-4d76-a55d-db369794b0db'
);
