-- Fix encoding issues in campaign_rules descriptions
-- Replace ?? with proper Spanish characters

UPDATE campaign_rules
SET description = REPLACE(description, 'conexi??n', 'conexión')
WHERE description LIKE '%conexi??n%';

UPDATE campaign_rules
SET description = REPLACE(description, 'p??liza', 'póliza')
WHERE description LIKE '%p??liza%';

UPDATE campaign_rules
SET description = REPLACE(description, 'vigencia', 'vigencia')
WHERE description LIKE '%vigencia%';

-- Also fix in campaigns table if needed
UPDATE campaigns
SET description = REPLACE(description, 'conexi??n', 'conexión')
WHERE description LIKE '%conexi??n%';

UPDATE campaigns
SET description = REPLACE(description, 'p??liza', 'póliza')
WHERE description LIKE '%p??liza%';

UPDATE campaigns
SET name = REPLACE(name, 'p??liza', 'póliza')
WHERE name LIKE '%p??liza%';

UPDATE campaigns
SET name = REPLACE(name, 'conexi??n', 'conexión')
WHERE name LIKE '%conexi??n%';

-- Verify changes
SELECT id, rule_kind, description 
FROM campaign_rules 
WHERE description LIKE '%conexión%' OR description LIKE '%póliza%'
ORDER BY campaign_id;
