-- Debug: Ver registros en campaign_progress
SELECT 
    cp.usuario_id,
    cp.campaign_id,
    cp.status,
    cp.progress,
    cp.eligible,
    u.nombre,
    u.email,
    c.name as campaign_name,
    c.slug as campaign_slug
FROM campaign_progress cp
LEFT JOIN usuarios u ON u.id = cp.usuario_id
LEFT JOIN campaigns c ON c.id = cp.campaign_id
WHERE cp.status IN ('eligible', 'completed')
ORDER BY cp.campaign_id, cp.usuario_id;
