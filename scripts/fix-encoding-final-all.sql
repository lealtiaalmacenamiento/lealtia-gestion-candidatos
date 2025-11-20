-- Fix ALL encoding issues - simplified version
-- Handles ISO-8859-1 double encoding patterns

-- Campaign Rules
UPDATE campaign_rules SET description = REPLACE(description, '├│', 'ó') WHERE description LIKE '%├│%';
UPDATE campaign_rules SET description = REPLACE(description, '├¡', 'á') WHERE description LIKE '%├¡%';
UPDATE campaign_rules SET description = REPLACE(description, '├⌐', 'é') WHERE description LIKE '%├⌐%';
UPDATE campaign_rules SET description = REPLACE(description, '├¡', 'í') WHERE description LIKE '%├¡%';
UPDATE campaign_rules SET description = REPLACE(description, '├║', 'ú') WHERE description LIKE '%├║%';
UPDATE campaign_rules SET description = REPLACE(description, '├▒', 'ñ') WHERE description LIKE '%├▒%';

-- Campaigns name
UPDATE campaigns SET name = REPLACE(name, '├│', 'ó') WHERE name LIKE '%├│%';
UPDATE campaigns SET name = REPLACE(name, '├¡', 'á') WHERE name LIKE '%├¡%';
UPDATE campaigns SET name = REPLACE(name, '├⌐', 'é') WHERE name LIKE '%├⌐%';
UPDATE campaigns SET name = REPLACE(name, '├¡', 'í') WHERE name LIKE '%├¡%';
UPDATE campaigns SET name = REPLACE(name, '├║', 'ú') WHERE name LIKE '%├║%';
UPDATE campaigns SET name = REPLACE(name, '├▒', 'ñ') WHERE name LIKE '%├▒%';

-- Campaigns summary
UPDATE campaigns SET summary = REPLACE(summary, '├│', 'ó') WHERE summary LIKE '%├│%';
UPDATE campaigns SET summary = REPLACE(summary, '├¡', 'á') WHERE summary LIKE '%├¡%';
UPDATE campaigns SET summary = REPLACE(summary, '├⌐', 'é') WHERE summary LIKE '%├⌐%';
UPDATE campaigns SET summary = REPLACE(summary, '├¡', 'í') WHERE summary LIKE '%├¡%';
UPDATE campaigns SET summary = REPLACE(summary, '├║', 'ú') WHERE summary LIKE '%├║%';
UPDATE campaigns SET summary = REPLACE(summary, '├▒', 'ñ') WHERE summary LIKE '%├▒%';

-- Campaigns description
UPDATE campaigns SET description = REPLACE(description, '├│', 'ó') WHERE description LIKE '%├│%';
UPDATE campaigns SET description = REPLACE(description, '├¡', 'á') WHERE description LIKE '%├¡%';
UPDATE campaigns SET description = REPLACE(description, '├⌐', 'é') WHERE description LIKE '%├⌐%';
UPDATE campaigns SET description = REPLACE(description, '├¡', 'í') WHERE description LIKE '%├¡%';
UPDATE campaigns SET description = REPLACE(description, '├║', 'ú') WHERE description LIKE '%├║%';
UPDATE campaigns SET description = REPLACE(description, '├▒', 'ñ') WHERE description LIKE '%├▒%';

-- Campaigns notes
UPDATE campaigns SET notes = REPLACE(notes, '├│', 'ó') WHERE notes LIKE '%├│%';
UPDATE campaigns SET notes = REPLACE(notes, '├¡', 'á') WHERE notes LIKE '%├¡%';
UPDATE campaigns SET notes = REPLACE(notes, '├⌐', 'é') WHERE notes LIKE '%├⌐%';
UPDATE campaigns SET notes = REPLACE(notes, '├¡', 'í') WHERE notes LIKE '%├¡%';
UPDATE campaigns SET notes = REPLACE(notes, '├║', 'ú') WHERE notes LIKE '%├║%';
UPDATE campaigns SET notes = REPLACE(notes, '├▒', 'ñ') WHERE notes LIKE '%├▒%';

-- Campaign Rewards title
UPDATE campaign_rewards SET title = REPLACE(title, '├│', 'ó') WHERE title LIKE '%├│%';
UPDATE campaign_rewards SET title = REPLACE(title, '├¡', 'á') WHERE title LIKE '%├¡%';
UPDATE campaign_rewards SET title = REPLACE(title, '├⌐', 'é') WHERE title LIKE '%├⌐%';
UPDATE campaign_rewards SET title = REPLACE(title, '├¡', 'í') WHERE title LIKE '%├¡%';
UPDATE campaign_rewards SET title = REPLACE(title, '├║', 'ú') WHERE title LIKE '%├║%';
UPDATE campaign_rewards SET title = REPLACE(title, '├▒', 'ñ') WHERE title LIKE '%├▒%';

-- Campaign Rewards description
UPDATE campaign_rewards SET description = REPLACE(description, '├│', 'ó') WHERE description LIKE '%├│%';
UPDATE campaign_rewards SET description = REPLACE(description, '├¡', 'á') WHERE description LIKE '%├¡%';
UPDATE campaign_rewards SET description = REPLACE(description, '├⌐', 'é') WHERE description LIKE '%├⌐%';
UPDATE campaign_rewards SET description = REPLACE(description, '├¡', 'í') WHERE description LIKE '%├¡%';
UPDATE campaign_rewards SET description = REPLACE(description, '├║', 'ú') WHERE description LIKE '%├║%';
UPDATE campaign_rewards SET description = REPLACE(description, '├▒', 'ñ') WHERE description LIKE '%├▒%';

-- Verify reto-5000 is fixed
SELECT priority, description FROM campaign_rules WHERE campaign_id = (SELECT id FROM campaigns WHERE slug = 'reto-5000') ORDER BY priority;
