-- Fix remaining encoding issues with more specific patterns
-- This handles the P??liza pattern specifically

-- Fix P??liza (double question marks)
UPDATE campaign_rules
SET description = REPLACE(description, 'P??liza', 'Póliza')
WHERE description LIKE '%P??liza%';

UPDATE campaign_rules
SET description = REPLACE(description, 'p??liza', 'póliza')
WHERE description LIKE '%p??liza%';

-- Fix d??as
UPDATE campaign_rules
SET description = REPLACE(description, 'd??as', 'días')
WHERE description LIKE '%d??as%';

-- Fix d??a
UPDATE campaign_rules
SET description = REPLACE(description, 'd??a', 'día')
WHERE description LIKE '%d??a%';

-- Fix m??nima
UPDATE campaign_rules
SET description = REPLACE(description, 'm??nima', 'mínima')
WHERE description LIKE '%m??nima%';

-- Fix m??nimo
UPDATE campaign_rules
SET description = REPLACE(description, 'm??nimo', 'mínimo')
WHERE description LIKE '%m??nimo%';

-- Fix conexi??n
UPDATE campaign_rules
SET description = REPLACE(description, 'conexi??n', 'conexión')
WHERE description LIKE '%conexi??n%';

-- Fix ├│ pattern (ISO-8859-1 double encoding)
UPDATE campaign_rules
SET description = REPLACE(description, '├│', 'ó')
WHERE description LIKE '%├│%';

-- Fix ├¡ pattern
UPDATE campaign_rules
SET description = REPLACE(description, '├¡', 'á')
WHERE description LIKE '%├¡%';

-- Fix ├¡ pattern
UPDATE campaign_rules
SET description = REPLACE(description, '├ª', 'é')
WHERE description LIKE '%├ª%';

-- Fix ├¡ pattern
UPDATE campaign_rules
SET description = REPLACE(description, '├¡', 'í')
WHERE description LIKE '%├¡%';

-- Fix ├║ pattern
UPDATE campaign_rules
SET description = REPLACE(description, '├║', 'ú')
WHERE description LIKE '%├║%';

-- Fix ├▒ pattern
UPDATE campaign_rules
SET description = REPLACE(description, '├▒', 'ñ')
WHERE description LIKE '%├▒%';

-- Show affected rows
SELECT id, priority, description 
FROM campaign_rules 
WHERE campaign_id = (SELECT id FROM campaigns WHERE slug = 'reto-5000')
ORDER BY priority;
