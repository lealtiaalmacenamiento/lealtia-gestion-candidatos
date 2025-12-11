-- =====================================================
-- Migration: Fix remaining functions with usuarios references
-- Date: 2024-12-11
-- Description: Add public. schema to all usuarios references
--              in functions with empty search_path
-- =====================================================

-- Fix calculate_campaign_datasets_for_user
CREATE OR REPLACE FUNCTION public.calculate_campaign_datasets_for_user(p_usuario_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
    v_id_auth uuid;
    v_result jsonb := '{}'::jsonb;
    v_polizas_prima_minima jsonb;
    v_polizas_recientes jsonb;
    v_polizas_por_producto jsonb;
BEGIN
    -- Get the auth UUID for the user
    SELECT id_auth INTO v_id_auth
    FROM public.usuarios
    WHERE id = p_usuario_id;

    IF v_id_auth IS NULL THEN
        RETURN v_result;
    END IF;

    -- Calculate polizas_prima_minima: count policies by minimum premium threshold
    WITH policy_data AS (
        SELECT
            p.id,
            p.prima_mxn,
            p.fecha_emision,
            p.estatus
        FROM public.polizas p
        JOIN public.clientes c ON c.id = p.cliente_id
        WHERE c.asesor_id = v_id_auth
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
        FROM public.polizas p
        JOIN public.clientes c ON c.id = p.cliente_id
        WHERE c.asesor_id = v_id_auth
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
        FROM public.polizas p
        JOIN public.clientes c ON c.id = p.cliente_id
        LEFT JOIN public.producto_parametros pp ON pp.id = p.producto_parametro_id
        LEFT JOIN public.product_types pt ON pt.id = pp.product_type_id
        WHERE c.asesor_id = v_id_auth
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
$function$;

-- Fix evaluate_all_campaigns
CREATE OR REPLACE FUNCTION public.evaluate_all_campaigns()
 RETURNS TABLE(usuarios_procesados integer, campanas_evaluadas integer, snapshots_actualizados integer, duracion_ms bigint)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_start_time timestamp;
  v_end_time timestamp;
  v_usuarios_count integer := 0;
  v_campanas_count integer := 0;
  v_snapshots_count integer := 0;
  v_usuario_id integer;
  v_campaign_id uuid;
BEGIN
  v_start_time := clock_timestamp();

  DELETE FROM public.campaign_progress
  WHERE evaluated_at < NOW() - INTERVAL '30 minutes';

  GET DIAGNOSTICS v_snapshots_count = ROW_COUNT;

  SELECT COUNT(DISTINCT u.id) INTO v_usuarios_count
  FROM public.usuarios u
  WHERE u.activo = true
    AND u.rol IN ('agente', 'asesor', 'supervisor');

  SELECT COUNT(*) INTO v_campanas_count
  FROM public.campaigns
  WHERE status = 'active'
    AND active_range @> CURRENT_DATE;

  v_end_time := clock_timestamp();

  RAISE NOTICE 'Limpieza de cache completada: % snapshots eliminados, % usuarios activos, % campañas activas',
    v_snapshots_count, v_usuarios_count, v_campanas_count;

  RETURN QUERY SELECT
    v_usuarios_count,
    v_campanas_count,
    v_snapshots_count,
    EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::bigint;
END;
$function$;

-- Fix transfer_reassign_usuario
CREATE OR REPLACE FUNCTION public.transfer_reassign_usuario(p_old_id bigint, p_new_id bigint, p_actor_email text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  old_usr record;
  new_usr record;
  moved_prospectos bigint := 0;
  moved_planificaciones bigint := 0;
  moved_agente_meta bigint := 0;
  moved_clientes bigint := 0;
  moved_citas_agente bigint := 0;
  moved_citas_super bigint := 0;
begin
  if p_old_id = p_new_id then
    raise exception 'El usuario destino debe ser diferente al usuario original';
  end if;

  select id, email, rol, activo, id_auth into old_usr from public.usuarios where id = p_old_id;
  if not found then
    raise exception 'Usuario origen no existe';
  end if;

  select id, email, rol, activo, id_auth into new_usr from public.usuarios where id = p_new_id;
  if not found then
    raise exception 'Usuario destino no existe';
  end if;
  if not new_usr.activo then
    raise exception 'El usuario destino no está activo';
  end if;
  if new_usr.id_auth is null then
    raise exception 'Usuario destino no tiene id_auth asignado';
  end if;

  update public.prospectos
     set agente_id = new_usr.id
   where agente_id = old_usr.id;
  get diagnostics moved_prospectos = row_count;

  update public.planificaciones
     set agente_id = new_usr.id
   where agente_id = old_usr.id;
  get diagnostics moved_planificaciones = row_count;

  update public.agente_meta
     set usuario_id = new_usr.id
   where usuario_id = old_usr.id;
  get diagnostics moved_agente_meta = row_count;

  if old_usr.id_auth is not null then
    update public.clientes
       set asesor_id = new_usr.id_auth
     where asesor_id = old_usr.id_auth;
    get diagnostics moved_clientes = row_count;

    update public.citas
       set agente_id = new_usr.id_auth
     where agente_id = old_usr.id_auth;
    get diagnostics moved_citas_agente = row_count;

    update public.citas
       set supervisor_id = new_usr.id_auth
     where supervisor_id = old_usr.id_auth;
    get diagnostics moved_citas_super = row_count;
  end if;

  delete from public.usuarios where id = old_usr.id;

  return json_build_object(
    'prospectos', moved_prospectos,
    'planificaciones', moved_planificaciones,
    'agente_meta', moved_agente_meta,
    'clientes', moved_clientes,
    'citas_agente', moved_citas_agente,
    'citas_supervisor', moved_citas_super
  );
end;
$function$;

-- Fix trigger_invalidate_cache_on_candidatos
CREATE OR REPLACE FUNCTION public.trigger_invalidate_cache_on_candidatos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_usuario_id bigint;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.mes_conexion IS DISTINCT FROM NEW.mes_conexion)
     OR TG_OP = 'INSERT' THEN

    SELECT u.id INTO v_usuario_id
    FROM public.usuarios u
    WHERE LOWER(u.email) = LOWER(COALESCE(NEW.email_agente, ''))
    LIMIT 1;

    IF v_usuario_id IS NOT NULL THEN
      PERFORM public.invalidate_campaign_cache_for_user(v_usuario_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Fix trigger_invalidate_cache_on_clientes
CREATE OR REPLACE FUNCTION public.trigger_invalidate_cache_on_clientes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_usuario_id bigint;
BEGIN
  SELECT u.id INTO v_usuario_id
  FROM public.usuarios u
  WHERE u.id_auth = COALESCE(NEW.asesor_id, OLD.asesor_id)
  LIMIT 1;

  IF v_usuario_id IS NOT NULL THEN
    PERFORM public.invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Fix trigger_invalidate_cache_on_prospectos
CREATE OR REPLACE FUNCTION public.trigger_invalidate_cache_on_prospectos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_usuario_id bigint;
BEGIN
  SELECT u.id INTO v_usuario_id
  FROM public.usuarios u
  WHERE u.id = COALESCE(NEW.agente_id, OLD.agente_id)
  LIMIT 1;

  IF v_usuario_id IS NOT NULL THEN
    PERFORM public.invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

COMMENT ON FUNCTION public.calculate_campaign_datasets_for_user(bigint) IS 'Calcula datasets de campaña con schema explícito';
COMMENT ON FUNCTION public.trigger_invalidate_cache_on_prospectos() IS 'Invalida cache de campañas al cambiar prospectos con schema explícito';
