-- Fix all encoding issues in campaign tables
-- This script fixes double-encoded UTF-8 characters

-- Fix campaign_rules descriptions
UPDATE campaign_rules
SET description = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    description,
    'Póliza', 'Póliza'),
    'póliza', 'póliza'),
    'días', 'días'),
    'día', 'día'),
    'mínima', 'mínima'),
    'mínimo', 'mínimo'),
    'conexión', 'conexión')
WHERE description LIKE '%Póliza%' 
   OR description LIKE '%póliza%'
   OR description LIKE '%días%'
   OR description LIKE '%día%'
   OR description LIKE '%mínima%'
   OR description LIKE '%mínimo%'
   OR description LIKE '%conexión%';

-- Fix campaigns name
UPDATE campaigns
SET name = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    name,
    'Póliza', 'Póliza'),
    'póliza', 'póliza'),
    'días', 'días'),
    'día', 'día'),
    'mínima', 'mínima'),
    'mínimo', 'mínimo'),
    'conexión', 'conexión')
WHERE name LIKE '%Póliza%' 
   OR name LIKE '%póliza%'
   OR name LIKE '%días%'
   OR name LIKE '%día%'
   OR name LIKE '%mínima%'
   OR name LIKE '%mínimo%'
   OR name LIKE '%conexión%';

-- Fix campaigns summary
UPDATE campaigns
SET summary = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    summary,
    'Póliza', 'Póliza'),
    'póliza', 'póliza'),
    'días', 'días'),
    'día', 'día'),
    'mínima', 'mínima'),
    'mínimo', 'mínimo'),
    'conexión', 'conexión')
WHERE summary LIKE '%Póliza%' 
   OR summary LIKE '%póliza%'
   OR summary LIKE '%días%'
   OR summary LIKE '%día%'
   OR summary LIKE '%mínima%'
   OR summary LIKE '%mínimo%'
   OR summary LIKE '%conexión%';

-- Fix campaigns description
UPDATE campaigns
SET description = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    description,
    'Póliza', 'Póliza'),
    'póliza', 'póliza'),
    'días', 'días'),
    'día', 'día'),
    'mínima', 'mínima'),
    'mínimo', 'mínimo'),
    'conexión', 'conexión')
WHERE description LIKE '%Póliza%' 
   OR description LIKE '%póliza%'
   OR description LIKE '%días%'
   OR description LIKE '%día%'
   OR description LIKE '%mínima%'
   OR description LIKE '%mínimo%'
   OR description LIKE '%conexión%';

-- Fix campaigns notes
UPDATE campaigns
SET notes = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    notes,
    'Póliza', 'Póliza'),
    'póliza', 'póliza'),
    'días', 'días'),
    'día', 'día'),
    'mínima', 'mínima'),
    'mínimo', 'mínimo'),
    'conexión', 'conexión')
WHERE notes LIKE '%Póliza%' 
   OR notes LIKE '%póliza%'
   OR notes LIKE '%días%'
   OR notes LIKE '%día%'
   OR notes LIKE '%mínima%'
   OR notes LIKE '%mínimo%'
   OR notes LIKE '%conexión%';

-- Fix campaign_rewards title
UPDATE campaign_rewards
SET title = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    title,
    'Póliza', 'Póliza'),
    'póliza', 'póliza'),
    'días', 'días'),
    'día', 'día'),
    'mínima', 'mínima'),
    'mínimo', 'mínimo'),
    'conexión', 'conexión')
WHERE title LIKE '%Póliza%' 
   OR title LIKE '%póliza%'
   OR title LIKE '%días%'
   OR title LIKE '%día%'
   OR title LIKE '%mínima%'
   OR title LIKE '%mínimo%'
   OR title LIKE '%conexión%';

-- Fix campaign_rewards description
UPDATE campaign_rewards
SET description = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    description,
    'Póliza', 'Póliza'),
    'póliza', 'póliza'),
    'días', 'días'),
    'día', 'día'),
    'mínima', 'mínima'),
    'mínimo', 'mínimo'),
    'conexión', 'conexión')
WHERE description LIKE '%Póliza%' 
   OR description LIKE '%póliza%'
   OR description LIKE '%días%'
   OR description LIKE '%día%'
   OR description LIKE '%mínima%'
   OR description LIKE '%mínimo%'
   OR description LIKE '%conexión%';

-- Show results
SELECT 'campaign_rules fixed' as table_name, COUNT(*) as affected_rows
FROM campaign_rules
WHERE description LIKE '%ó%' OR description LIKE '%í%' OR description LIKE '%á%';

SELECT 'campaigns fixed' as table_name, COUNT(*) as affected_rows
FROM campaigns
WHERE name LIKE '%ó%' OR summary LIKE '%ó%' OR description LIKE '%ó%' OR notes LIKE '%ó%';

SELECT 'campaign_rewards fixed' as table_name, COUNT(*) as affected_rows
FROM campaign_rewards
WHERE title LIKE '%ó%' OR description LIKE '%ó%';
