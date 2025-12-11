[dotenv@17.2.1] injecting env (16) from .env.local -- tip: ÔÜÖ´©Å  enable debug logging with { debug: true }

-- ========== apply_cliente_update ==========
CREATE OR REPLACE FUNCTION public.apply_cliente_update(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_cliente_id uuid;
  v_payload jsonb;
  r_old clientes%ROWTYPE;
  r_new clientes%ROWTYPE;
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor/super_usuario)';
  END IF;

  SELECT cliente_id, payload_propuesto
    INTO v_cliente_id, v_payload
  FROM cliente_update_requests
  WHERE id = p_request_id AND estado = 'PENDIENTE'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud no encontrada o no pendiente';
  END IF;

  SELECT * INTO r_old FROM clientes WHERE id = v_cliente_id FOR UPDATE;

  -- Actualiza campos permitidos (usa COALESCE para mantener si no viene en payload)
  UPDATE clientes SET
    primer_nombre      = COALESCE(UPPER(TRIM(v_payload->>'primer_nombre')), primer_nombre),
    segundo_nombre     = COALESCE(UPPER(TRIM(v_payload->>'segundo_nombre')), segundo_nombre),
    primer_apellido    = COALESCE(UPPER(TRIM(v_payload->>'primer_apellido')), primer_apellido),
    segundo_apellido   = COALESCE(UPPER(TRIM(v_payload->>'segundo_apellido')), segundo_apellido),
    telefono_celular   = COALESCE(TRIM(v_payload->>'telefono_celular'), telefono_celular),
    correo             = COALESCE(LOWER(TRIM(v_payload->>'correo')), correo),
    full_name_normalizado = UPPER(TRIM(
      COALESCE(v_payload->>'primer_nombre', primer_nombre) || ' ' ||
      COALESCE(v_payload->>'segundo_nombre', COALESCE(segundo_nombre,'')) || ' ' ||
      COALESCE(v_payload->>'primer_apellido', primer_apellido) || ' ' ||
      COALESCE(v_payload->>'segundo_apellido', segundo_apellido)
    )),
    updated_at = now()
  WHERE id = v_cliente_id;

  SELECT * INTO r_new FROM clientes WHERE id = v_cliente_id;

  INSERT INTO cliente_historial (
    id, cliente_id, cambio_tipo, payload_old, payload_new, actor_id, creado_at
  ) VALUES (
    gen_random_uuid(), v_cliente_id, 'APROBACION', to_jsonb(r_old), to_jsonb(r_new), auth.uid(), now()
  );

  UPDATE cliente_update_requests
  SET estado = 'APROBADA', resuelto_at = now(), resuelto_por = auth.uid()
  WHERE id = p_request_id;
END;
$function$


-- ========== apply_poliza_update ==========
CREATE OR REPLACE FUNCTION public.apply_poliza_update(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_poliza_id uuid;
  v_payload jsonb;
  v_estado text;
  r_old polizas%ROWTYPE;
  r_new polizas%ROWTYPE;
  v_old_prima numeric(14,2);
  v_new_prima numeric(14,2);
  v_periodicidad_raw text;
  v_periodicidad_txt text;
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor/super_usuario)';
  END IF;

  -- Leer la solicitud SIN FOR UPDATE (parece causar que no se devuelva fila en RLS)
  SELECT poliza_id, payload_propuesto, estado
    INTO v_poliza_id, v_payload, v_estado
  FROM poliza_update_requests
  WHERE id = p_request_id;

  IF v_poliza_id IS NULL THEN
    RAISE EXCEPTION 'solicitud no encontrada';
  END IF;
  IF v_estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'solicitud no pendiente (estado=%)', v_estado;
  END IF;

  -- Bloquear la p├│liza (evita condiciones de carrera)
  SELECT * INTO r_old FROM polizas WHERE id = v_poliza_id FOR UPDATE;

  v_periodicidad_raw := NULLIF(v_payload->>'periodicidad_pago','');
  IF v_periodicidad_raw IS NOT NULL THEN
    v_periodicidad_raw := upper(trim(v_periodicidad_raw));
    IF v_periodicidad_raw IN ('A','ANUAL','ANUALIDAD') THEN v_periodicidad_txt := 'A';
    ELSIF v_periodicidad_raw IN ('S','SEMESTRAL','SEMESTRA') THEN v_periodicidad_txt := 'S';
    ELSIF v_periodicidad_raw IN ('T','TRIMESTRAL','TRIMESTRE') THEN v_periodicidad_txt := 'T';
    ELSIF v_periodicidad_raw IN ('M','MENSUAL','MES') THEN v_periodicidad_txt := 'M';
    ELSIF v_periodicidad_raw IN ('A','S','T','M') THEN v_periodicidad_txt := v_periodicidad_raw; ELSE v_periodicidad_txt := NULL; END IF;
  END IF;

  UPDATE polizas SET
    numero_poliza         = COALESCE(NULLIF(TRIM(v_payload->>'numero_poliza'),''), numero_poliza),
    estatus               = COALESCE(NULLIF(v_payload->>'estatus','')::estatus_poliza, estatus),
    fecha_emision         = COALESCE(NULLIF(v_payload->>'fecha_emision','')::date, fecha_emision),
    fecha_renovacion      = COALESCE(NULLIF(v_payload->>'fecha_renovacion','')::date, fecha_renovacion),
    forma_pago            = COALESCE(NULLIF(v_payload->>'forma_pago','')::forma_pago, forma_pago),
    periodicidad_pago     = COALESCE((CASE WHEN v_periodicidad_txt IS NOT NULL THEN v_periodicidad_txt::public.periodicidad_pago END), periodicidad_pago),
    dia_pago              = COALESCE(NULLIF(v_payload->>'dia_pago','')::int, dia_pago),
    prima_input           = COALESCE(NULLIF(v_payload->>'prima_input','')::numeric, prima_input),
    prima_moneda          = COALESCE(NULLIF(v_payload->>'prima_moneda','')::moneda_poliza, prima_moneda),
    sa_input              = COALESCE(NULLIF(v_payload->>'sa_input','')::numeric, sa_input),
    sa_moneda             = COALESCE(NULLIF(v_payload->>'sa_moneda','')::moneda_poliza, sa_moneda),
    producto_parametro_id = COALESCE(NULLIF(v_payload->>'producto_parametro_id','')::uuid, producto_parametro_id),
    meses_check           = COALESCE((CASE WHEN jsonb_typeof(v_payload->'meses_check')='object' THEN v_payload->'meses_check' END), meses_check),
    updated_at            = now()
  WHERE id = v_poliza_id;

  SELECT * INTO r_new FROM polizas WHERE id = v_poliza_id;

  v_old_prima := r_old.prima_input;
  v_new_prima := r_new.prima_input;
  IF v_old_prima IS DISTINCT FROM v_new_prima THEN
    INSERT INTO historial_costos_poliza(
      id, poliza_id, prima_anual_old, prima_anual_new, porcentaje_comision_old, porcentaje_comision_new, actor_id, creado_at
    ) VALUES (
      gen_random_uuid(), v_poliza_id, v_old_prima, v_new_prima, NULL, NULL, auth.uid(), now()
    );
  END IF;

  UPDATE poliza_update_requests
  SET estado='APROBADA', resuelto_at=now(), resuelto_por=auth.uid()
  WHERE id = p_request_id AND estado='PENDIENTE';

  PERFORM recalc_puntos_poliza(v_poliza_id);
END;
$function$


-- ========== apply_poliza_update_dbg ==========
CREATE OR REPLACE FUNCTION public.apply_poliza_update_dbg(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_row poliza_update_requests%ROWTYPE;
  v_is_super boolean;
  v_poliza_before polizas%ROWTYPE;
  v_poliza_after polizas%ROWTYPE;
  v_err text;
  v_state text;
BEGIN
  v_is_super := is_super_role();
  SELECT * INTO v_row FROM poliza_update_requests WHERE id = p_request_id;
  IF v_row.poliza_id IS NOT NULL THEN
    SELECT * INTO v_poliza_before FROM polizas WHERE id = v_row.poliza_id;
  END IF;
  BEGIN
    PERFORM apply_poliza_update(p_request_id);
    IF v_row.poliza_id IS NOT NULL THEN
      SELECT * INTO v_poliza_after FROM polizas WHERE id = v_row.poliza_id;
    END IF;
    RETURN jsonb_build_object(
      'status','ok',
      'is_super', v_is_super,
      'request_row', to_jsonb(v_row),
      'poliza_before', to_jsonb(v_poliza_before),
      'poliza_after', to_jsonb(v_poliza_after)
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM; v_state := SQLSTATE;
    RETURN jsonb_build_object(
      'status','error',
      'is_super', v_is_super,
      'sqlstate', v_state,
      'error', v_err,
      'request_row', to_jsonb(v_row)
    );
  END;
END;
$function$


-- ========== polizas_before_insupd_enforce_moneda ==========
CREATE OR REPLACE FUNCTION public.polizas_before_insupd_enforce_moneda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_moneda moneda_poliza;
BEGIN
  IF NEW.producto_parametro_id IS NOT NULL THEN
    SELECT moneda INTO v_moneda FROM producto_parametros WHERE id = NEW.producto_parametro_id;
    IF v_moneda IS NOT NULL THEN
      NEW.prima_moneda := v_moneda;
      NEW.sa_moneda := v_moneda;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


-- ========== producto_parametros_after_update_sync_moneda ==========
CREATE OR REPLACE FUNCTION public.producto_parametros_after_update_sync_moneda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_changed boolean := false;
  v_updated int := 0;
BEGIN
  IF NEW.moneda IS DISTINCT FROM OLD.moneda THEN
    v_changed := true;
  END IF;

  IF v_changed THEN
    -- Si la nueva moneda es NULL, no forzamos sincronizaci├│n (sin especificaci├│n de moneda)
    IF NEW.moneda IS NOT NULL THEN
      -- Actualizar moneda de primas y suma asegurada de p├│lizas que apuntan a este producto
      UPDATE polizas
        SET prima_moneda = NEW.moneda,
            sa_moneda = NEW.moneda,
            updated_at = now()
        WHERE producto_parametro_id = NEW.id
          AND (
            prima_moneda IS DISTINCT FROM NEW.moneda
            OR sa_moneda IS DISTINCT FROM NEW.moneda
            OR sa_moneda IS NULL
          );
    END IF;

    -- Recalcular cache/puntos de las p├│lizas afectadas
    PERFORM recalc_polizas_by_producto_parametro(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$


-- ========== recalc_polizas_by_producto_parametro ==========
CREATE OR REPLACE FUNCTION public.recalc_polizas_by_producto_parametro(p_pp_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_count int := 0;
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM polizas WHERE producto_parametro_id = p_pp_id LOOP
    PERFORM recalc_puntos_poliza(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$


-- ========== recalc_puntos_poliza ==========
CREATE OR REPLACE FUNCTION public.recalc_puntos_poliza(p_poliza_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_prima_input numeric;
  v_prima_mxn numeric;
  v_prima_moneda moneda_poliza;
  v_sa_mxn numeric;
  v_sa_input numeric;
  v_sa_moneda moneda_poliza;
  v_tipo_code text;
  v_tipo_name text;
  v_tipo_id uuid;
  v_estatus estatus_poliza;
  v_pp_id uuid;
  v_year int;
  v_base_factor numeric;
  v_puntos numeric;
  v_clas tipo_clasificacion_puntos;
  v_fx numeric;
  v_udi numeric;
  v_fecha date;
  v_pp_auto uuid;
  v_sa_mxn_live numeric;
begin
  select p.prima_input, p.prima_mxn, p.prima_moneda, p.sa_mxn, p.sa_input, p.sa_moneda,
         p.estatus, p.producto_parametro_id, p.fecha_emision
    into v_prima_input, v_prima_mxn, v_prima_moneda, v_sa_mxn, v_sa_input, v_sa_moneda,
         v_estatus, v_pp_id, v_fecha
  from polizas p
  where p.id = p_poliza_id;

  if not found then
    raise exception 'poliza % no existe', p_poliza_id;
  end if;

  v_prima_mxn := normalize_prima(v_prima_input, v_prima_moneda, current_date);

  v_fx := null; v_udi := null;
  if v_prima_moneda = 'USD'::moneda_poliza then
    select get_fx_usd(current_date) into v_fx;
  elsif v_prima_moneda = 'UDI'::moneda_poliza then
    select get_current_udi(current_date) into v_udi;
  end if;

  if v_sa_input is not null and v_sa_moneda is not null then
    v_sa_mxn_live := normalize_prima(v_sa_input, v_sa_moneda, current_date);
  else
    v_sa_mxn_live := null;
  end if;

  if v_pp_id is null then
    select pp.id
      into v_pp_auto
    from producto_parametros pp
    where pp.activo = true
      and (pp.moneda is null or pp.moneda = v_prima_moneda)
      and (
        v_sa_mxn_live is null
        or (
          (pp.sa_min is null or v_sa_mxn_live >= pp.sa_min)
          and (pp.sa_max is null or v_sa_mxn_live <= pp.sa_max)
        )
      )
    order by
      case when pp.moneda = v_prima_moneda then 0 else 1 end,
      coalesce(pp.sa_min, (-1)::numeric) desc
    limit 1;

    if v_pp_auto is not null then
      v_pp_id := v_pp_auto;
      update polizas set producto_parametro_id = v_pp_auto, updated_at = now()
      where id = p_poliza_id;
    end if;
  end if;

  if v_estatus = 'ANULADA'::estatus_poliza then
    v_puntos := 0;
    v_clas := 'CERO';
    v_tipo_code := null;
    v_tipo_name := null;
    v_tipo_id := null;
  else
    if v_pp_id is not null then
      select pt.code, pt.name, pt.id
        into v_tipo_code, v_tipo_name, v_tipo_id
      from producto_parametros pp
      join product_types pt on pt.id = pp.product_type_id
      where pp.id = v_pp_id;
    else
      v_tipo_code := null;
      v_tipo_name := null;
      v_tipo_id := null;
    end if;

    if v_tipo_code is not null then
      v_tipo_code := upper(v_tipo_code);
    end if;

    if v_tipo_code = 'GMM' then
      if v_prima_mxn is not null and v_prima_mxn >= 7500 then
        v_puntos := 0.5; v_clas := 'MEDIO';
      else
        v_puntos := 0; v_clas := 'CERO';
      end if;
    elsif v_tipo_code = 'VI' then
      if v_prima_mxn is null or v_prima_mxn < 15000 then
        v_puntos := 0; v_clas := 'CERO';
      elsif v_prima_mxn >= 150000 then
        v_puntos := 3; v_clas := 'TRIPLE';
      elsif v_prima_mxn >= 50000 then
        v_puntos := 2; v_clas := 'DOBLE';
      else
        v_puntos := 1; v_clas := 'SIMPLE';
      end if;
    else
      v_puntos := 0; v_clas := 'CERO';
    end if;
  end if;

  select poliza_year_vigencia(p.fecha_emision) into v_year
  from polizas p where p.id = p_poliza_id;

  if v_pp_id is not null and v_estatus = 'EN_VIGOR'::estatus_poliza then
    select case
             when coalesce(duracion_anios, 9999) <= 10 then
               case least(v_year, coalesce(duracion_anios, 10))
                 when 1 then anio_1_percent
                 when 2 then anio_2_percent
                 when 3 then anio_3_percent
                 when 4 then anio_4_percent
                 when 5 then anio_5_percent
                 when 6 then anio_6_percent
                 when 7 then anio_7_percent
                 when 8 then anio_8_percent
                 when 9 then anio_9_percent
                 when 10 then anio_10_percent
                 else null
               end
             else
               case
                 when v_year = 1 then anio_1_percent
                 when v_year = 2 then anio_2_percent
                 when v_year = 3 then anio_3_percent
                 when v_year = 4 then anio_4_percent
                 when v_year = 5 then anio_5_percent
                 when v_year = 6 then anio_6_percent
                 when v_year = 7 then anio_7_percent
                 when v_year = 8 then anio_8_percent
                 when v_year = 9 then anio_9_percent
                 when v_year = 10 then anio_10_percent
                 else anio_11_plus_percent
               end
           end
      into v_base_factor
    from producto_parametros
    where id = v_pp_id;
  else
    v_base_factor := null;
  end if;

  v_puntos := coalesce(v_puntos, 0);
  v_clas := coalesce(v_clas, 'CERO');

  insert into poliza_puntos_cache (
    poliza_id, puntos_total, clasificacion, base_factor, producto_factor,
    year_factor, prima_anual_snapshot, producto_parametro_id, udi_valor, usd_fx,
    breakdown, recalculo_reason, computed_at, updated_at
  )
  select p.id, v_puntos, v_clas, v_base_factor, null,
         v_year, v_prima_mxn, v_pp_id, v_udi, v_fx,
         jsonb_build_object(
           'year', v_year,
           'factor_base', v_base_factor,
           'producto', v_tipo_code,
           'producto_nombre', v_tipo_name,
           'producto_type_id', v_tipo_id,
           'prima_mxn', v_prima_mxn,
           'sa_mxn', v_sa_mxn_live,
           'prima_moneda', v_prima_moneda,
           'fx_aplicado', v_fx,
           'udi_aplicada', v_udi,
           'tasas_fecha', to_char(current_date, 'YYYY-MM-DD')
         ),
         'recalc', now(), now()
  from polizas p where p.id = p_poliza_id
  on conflict (poliza_id) do update set
    puntos_total = excluded.puntos_total,
    clasificacion = excluded.clasificacion,
    base_factor = excluded.base_factor,
    producto_factor = excluded.producto_factor,
    year_factor = excluded.year_factor,
    prima_anual_snapshot = excluded.prima_anual_snapshot,
    producto_parametro_id = excluded.producto_parametro_id,
    udi_valor = excluded.udi_valor,
    usd_fx = excluded.usd_fx,
    breakdown = excluded.breakdown,
    recalculo_reason = excluded.recalculo_reason,
    computed_at = excluded.computed_at,
    updated_at = excluded.updated_at;
end;
$function$


-- ========== recalc_puntos_poliza_all ==========
CREATE OR REPLACE FUNCTION public.recalc_puntos_poliza_all(p_limit integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_count int := 0;
  r RECORD;
BEGIN
  FOR r IN 
    SELECT id FROM polizas
    ORDER BY updated_at DESC
    LIMIT COALESCE(p_limit, 2147483647)
  LOOP
    PERFORM recalc_puntos_poliza(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$


-- ========== trigger_invalidate_cache_on_polizas ==========
CREATE OR REPLACE FUNCTION public.trigger_invalidate_cache_on_polizas()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- Obtener usuario_id del cliente asociado
  SELECT u.id INTO v_usuario_id
  FROM clientes c
  JOIN usuarios u ON u.id_auth = c.asesor_id
  WHERE c.id = COALESCE(NEW.cliente_id, OLD.cliente_id)
  LIMIT 1;
  
  IF v_usuario_id IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$

