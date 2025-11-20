-- Create function to calculate dynamic campaign datasets
-- This function computes polizas_prima_minima, polizas_recientes, and other datasets
-- from actual policy data

CREATE OR REPLACE FUNCTION calculate_campaign_datasets_for_user(p_usuario_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_user_auth_id uuid;
    v_result jsonb := '{}'::jsonb;
    v_polizas_prima_minima jsonb;
    v_polizas_recientes jsonb;
    v_polizas_por_producto jsonb;
BEGIN
    -- Get user's auth ID
    SELECT id_auth::uuid INTO v_user_auth_id
    FROM usuarios
    WHERE id = p_usuario_id;
    
    IF v_user_auth_id IS NULL THEN
        RETURN v_result;
    END IF;
    
    -- Calculate polizas_prima_minima: count policies by minimum premium threshold
    -- This will be parameterized per campaign rule, but we calculate common thresholds
    WITH policy_data AS (
        SELECT 
            p.id,
            p.prima_mxn,
            p.fecha_emision,
            p.estatus
        FROM polizas p
        JOIN clientes c ON c.id = p.cliente_id
        WHERE c.asesor_id = v_user_auth_id
          AND p.estatus != 'ANULADA'
    )
    SELECT jsonb_build_object(
        'prima_25000', (SELECT COUNT(*) FROM policy_data WHERE prima_mxn >= 25000),
        'prima_50000', (SELECT COUNT(*) FROM policy_data WHERE prima_mxn >= 50000),
        'prima_100000', (SELECT COUNT(*) FROM policy_data WHERE prima_mxn >= 100000)
    ) INTO v_polizas_prima_minima;
    
    v_result := jsonb_set(v_result, '{polizas_prima_minima}', v_polizas_prima_minima);
    
    -- Calculate polizas_recientes: count recent policies within time windows
    WITH policy_data AS (
        SELECT 
            p.id,
            p.prima_mxn,
            p.fecha_emision,
            p.estatus,
            p.cliente_id,
            (CURRENT_DATE - p.fecha_emision) as dias_desde_emision
        FROM polizas p
        JOIN clientes c ON c.id = p.cliente_id
        WHERE c.asesor_id = v_user_auth_id
          AND p.estatus != 'ANULADA'
    ),
    recent_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE dias_desde_emision <= 30) as recientes_30,
            COUNT(*) FILTER (WHERE dias_desde_emision <= 90) as recientes_90,
            COUNT(*) FILTER (WHERE dias_desde_emision <= 180) as recientes_180,
            COUNT(*) FILTER (WHERE dias_desde_emision <= 365) as recientes_365,
            MIN(dias_desde_emision) as ultima_emision_dias
        FROM policy_data
    )
    SELECT jsonb_build_object(
        'ventana_30', recientes_30,
        'ventana_90', recientes_90,
        'ventana_180', recientes_180,
        'ventana_365', recientes_365,
        'ultima_emision_dias', COALESCE(ultima_emision_dias, 999999)
    ) INTO v_polizas_recientes
    FROM recent_counts;
    
    v_result := jsonb_set(v_result, '{polizas_recientes}', v_polizas_recientes);
    
    -- Calculate polizas_por_producto: count policies by product type
    WITH policy_by_product AS (
        SELECT 
            pp.product_type_id,
            pt.code as product_code,
            COUNT(*) as cantidad
        FROM polizas p
        JOIN clientes c ON c.id = p.cliente_id
        LEFT JOIN producto_parametros pp ON pp.id = p.producto_parametro_id
        LEFT JOIN product_types pt ON pt.id = pp.product_type_id
        WHERE c.asesor_id = v_user_auth_id
          AND p.estatus != 'ANULADA'
        GROUP BY pp.product_type_id, pt.code
    )
    SELECT jsonb_object_agg(
        COALESCE(product_code, 'sin_tipo'),
        cantidad
    ) INTO v_polizas_por_producto
    FROM policy_by_product;
    
    v_result := jsonb_set(v_result, '{polizas_por_producto}', COALESCE(v_polizas_por_producto, '{}'::jsonb));
    
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION calculate_campaign_datasets_for_user IS 
'Calculates dynamic campaign datasets (polizas_prima_minima, polizas_recientes, polizas_por_producto) from actual policy data for a given user';

-- Test the function
SELECT calculate_campaign_datasets_for_user((SELECT id FROM usuarios WHERE email = 'paopecina3@gmail.com'));
