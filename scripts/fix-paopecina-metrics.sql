-- Temporary fix: Insert custom metrics for paopecina3@gmail.com
-- This allows the user to be eligible while we implement proper dataset calculations

-- Get the usuario_id for paopecina3@gmail.com
DO $$
DECLARE
    v_usuario_id bigint;
BEGIN
    SELECT id INTO v_usuario_id FROM usuarios WHERE email = 'paopecina3@gmail.com';
    
    IF v_usuario_id IS NOT NULL THEN
        -- Insert polizas_prima_minima dataset
        INSERT INTO campaigns_custom_metrics (usuario_id, dataset, metric, numeric_value, updated_at)
        VALUES (v_usuario_id, 'polizas_prima_minima', 'cantidad', 2, NOW())
        ON CONFLICT (usuario_id, dataset, metric) 
        DO UPDATE SET numeric_value = 2, updated_at = NOW();
        
        -- Insert polizas_recientes dataset
        INSERT INTO campaigns_custom_metrics (usuario_id, dataset, metric, numeric_value, updated_at)
        VALUES (v_usuario_id, 'polizas_recientes', 'cantidad', 2, NOW())
        ON CONFLICT (usuario_id, dataset, metric)
        DO UPDATE SET numeric_value = 2, updated_at = NOW();
        
        RAISE NOTICE 'Métricas personalizadas insertadas para usuario_id: %', v_usuario_id;
    ELSE
        RAISE NOTICE 'Usuario no encontrado: paopecina3@gmail.com';
    END IF;
END $$;

-- Verify
SELECT u.email, ccm.dataset, ccm.metric, ccm.numeric_value
FROM campaigns_custom_metrics ccm
JOIN usuarios u ON u.id = ccm.usuario_id
WHERE u.email = 'paopecina3@gmail.com'
ORDER BY ccm.dataset, ccm.metric;
