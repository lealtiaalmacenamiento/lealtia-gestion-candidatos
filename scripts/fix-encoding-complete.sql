-- Fix ALL encoding issues across all campaign tables
-- Handles multiple encoding patterns: ISO-8859-1, double-encoding, etc.

-- Campaign Rules - Fix all encoding patterns
UPDATE campaign_rules
SET description = 
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(description,
        '├│', 'ó'),
        '├¡', 'á'),
        '├⌐', 'é'),
        '├¡', 'í'),
        '├║', 'ú'),
        '├▒', 'ñ'),
        'Ã³', 'ó'),
        'Ã¡', 'á'),
        'Ã©', 'é'),
        'Ã­', 'í'),
        'Ãº', 'ú'),
        'Ã±', 'ñ'),
        'Ã'', 'Ó'),
        'Ã'', 'Ñ')
WHERE description ~ '├│|├¡|├⌐|├¡|├║|├▒|Ã³|Ã¡|Ã©|Ã­|Ãº|Ã±|Ã'|Ã'';

-- Campaigns - name
UPDATE campaigns
SET name = 
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(name,
        '├│', 'ó'),
        '├¡', 'á'),
        '├⌐', 'é'),
        '├¡', 'í'),
        '├║', 'ú'),
        '├▒', 'ñ'),
        'Ã³', 'ó'),
        'Ã¡', 'á'),
        'Ã©', 'é'),
        'Ã­', 'í'),
        'Ãº', 'ú'),
        'Ã±', 'ñ'),
        'Ã'', 'Ó'),
        'Ã'', 'Ñ')
WHERE name ~ '├│|├¡|├⌐|├¡|├║|├▒|Ã³|Ã¡|Ã©|Ã­|Ãº|Ã±|Ã'|Ã'';

-- Campaigns - summary
UPDATE campaigns
SET summary = 
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(summary,
        '├│', 'ó'),
        '├¡', 'á'),
        '├⌐', 'é'),
        '├¡', 'í'),
        '├║', 'ú'),
        '├▒', 'ñ'),
        'Ã³', 'ó'),
        'Ã¡', 'á'),
        'Ã©', 'é'),
        'Ã­', 'í'),
        'Ãº', 'ú'),
        'Ã±', 'ñ'),
        'Ã'', 'Ó'),
        'Ã'', 'Ñ')
WHERE summary ~ '├│|├¡|├⌐|├¡|├║|├▒|Ã³|Ã¡|Ã©|Ã­|Ãº|Ã±|Ã'|Ã'';

-- Campaigns - description
UPDATE campaigns
SET description = 
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(description,
        '├│', 'ó'),
        '├¡', 'á'),
        '├⌐', 'é'),
        '├¡', 'í'),
        '├║', 'ú'),
        '├▒', 'ñ'),
        'Ã³', 'ó'),
        'Ã¡', 'á'),
        'Ã©', 'é'),
        'Ã­', 'í'),
        'Ãº', 'ú'),
        'Ã±', 'ñ'),
        'Ã'', 'Ó'),
        'Ã'', 'Ñ')
WHERE description ~ '├│|├¡|├⌐|├¡|├║|├▒|Ã³|Ã¡|Ã©|Ã­|Ãº|Ã±|Ã'|Ã'';

-- Campaigns - notes
UPDATE campaigns
SET notes = 
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(notes,
        '├│', 'ó'),
        '├¡', 'á'),
        '├⌐', 'é'),
        '├¡', 'í'),
        '├║', 'ú'),
        '├▒', 'ñ'),
        'Ã³', 'ó'),
        'Ã¡', 'á'),
        'Ã©', 'é'),
        'Ã­', 'í'),
        'Ãº', 'ú'),
        'Ã±', 'ñ'),
        'Ã'', 'Ó'),
        'Ã'', 'Ñ')
WHERE notes ~ '├│|├¡|├⌐|├¡|├║|├▒|Ã³|Ã¡|Ã©|Ã­|Ãº|Ã±|Ã'|Ã'';

-- Campaign Rewards - title
UPDATE campaign_rewards
SET title = 
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(title,
        '├│', 'ó'),
        '├¡', 'á'),
        '├⌐', 'é'),
        '├¡', 'í'),
        '├║', 'ú'),
        '├▒', 'ñ'),
        'Ã³', 'ó'),
        'Ã¡', 'á'),
        'Ã©', 'é'),
        'Ã­', 'í'),
        'Ãº', 'ú'),
        'Ã±', 'ñ'),
        'Ã'', 'Ó'),
        'Ã'', 'Ñ')
WHERE title ~ '├│|├¡|├⌐|├¡|├║|├▒|Ã³|Ã¡|Ã©|Ã­|Ãº|Ã±|Ã'|Ã'';

-- Campaign Rewards - description
UPDATE campaign_rewards
SET description = 
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(
    REPLACE(description,
        '├│', 'ó'),
        '├¡', 'á'),
        '├⌐', 'é'),
        '├¡', 'í'),
        '├║', 'ú'),
        '├▒', 'ñ'),
        'Ã³', 'ó'),
        'Ã¡', 'á'),
        'Ã©', 'é'),
        'Ã­', 'í'),
        'Ãº', 'ú'),
        'Ã±', 'ñ'),
        'Ã'', 'Ó'),
        'Ã'', 'Ñ')
WHERE description ~ '├│|├¡|├⌐|├¡|├║|├▒|Ã³|Ã¡|Ã©|Ã­|Ãº|Ã±|Ã'|Ã'';

-- Verify reto-5000 rules are fixed
SELECT id, priority, description 
FROM campaign_rules 
WHERE campaign_id = (SELECT id FROM campaigns WHERE slug = 'reto-5000')
ORDER BY priority;
