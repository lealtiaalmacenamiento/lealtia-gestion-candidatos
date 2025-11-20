-- Force correct UTF-8 by converting through bytea
-- This ensures the text is stored as proper UTF-8

UPDATE campaign_rules 
SET description = convert_from(convert_to('Póliza emitida recientemente (sin historial previo en 12 meses)', 'UTF8'), 'UTF8')
WHERE campaign_id = (SELECT id FROM campaigns WHERE slug = 'reto-5000') 
  AND priority = 5;

-- Verify
SELECT priority, description, 
       encode(convert_to(description, 'UTF8'), 'hex') as utf8_hex
FROM campaign_rules 
WHERE campaign_id = (SELECT id FROM campaigns WHERE slug = 'reto-5000')
ORDER BY priority;
