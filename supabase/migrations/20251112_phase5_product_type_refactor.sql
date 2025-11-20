-- Phase 5 follow-up: refactor puntos calculation to use product_types catalog
set check_function_bodies = off;

create or replace function public.recalc_puntos_poliza(p_poliza_id uuid)
returns void
language plpgsql
as $$
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
$$;

comment on function public.recalc_puntos_poliza(uuid)
  is 'Recalcula puntos de póliza utilizando valores actuales de FX/UDI y catálogo dinámico de product_types.';
