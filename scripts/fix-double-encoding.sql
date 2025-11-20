-- Fix double-encoded UTF-8 in campaign_rules
-- The database has UTF-8 bytes that were interpreted as Latin1 and re-encoded as UTF-8

-- Fix all descriptions with double encoding issues
UPDATE campaign_rules
SET description = convert_from(convert_to(description, 'LATIN1'), 'UTF8')
WHERE description LIKE '%Ã%' 
   OR description LIKE '%├%'
   OR description LIKE '%┬%';

-- Verify the fixes
SELECT id, rule_kind, description 
FROM campaign_rules 
WHERE description LIKE '%conexión%' 
   OR description LIKE '%póliza%'
   OR description LIKE '%mínima%'
ORDER BY campaign_id;
