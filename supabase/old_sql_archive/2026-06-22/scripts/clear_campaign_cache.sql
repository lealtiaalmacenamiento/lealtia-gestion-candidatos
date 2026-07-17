-- Clear campaign progress cache for paopecina3@gmail.com
DELETE FROM campaign_progress 
WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = 'paopecina3@gmail.com');
