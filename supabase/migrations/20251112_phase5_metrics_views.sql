-- Phase 5: reporting views for campaigns and RC metrics
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- vw_polizas_metricas
-- -----------------------------------------------------------------------------
drop view if exists public.vw_polizas_metricas;
create view public.vw_polizas_metricas as
with base as (
  select
    p.id as poliza_id,
    p.estatus,
    p.prima_mxn,
    p.fecha_emision,
    p.updated_at,
    p.anulada_at,
    c.asesor_id,
    u.id as usuario_id,
    u.email as usuario_email,
    u.nombre as usuario_nombre
  from public.polizas p
  join public.clientes c on c.id = p.cliente_id
  left join public.usuarios u on u.id_auth = c.asesor_id
),
cache as (
  select
    pc.poliza_id,
    pc.prima_anual_snapshot,
    pc.base_factor,
    pc.puntos_total
  from public.poliza_puntos_cache pc
)
select
  b.asesor_id,
  b.usuario_id,
  b.usuario_email,
  b.usuario_nombre,
  count(*) as polizas_total,
  count(*) filter (where b.estatus = 'EN_VIGOR') as polizas_vigentes,
  count(*) filter (where b.estatus = 'ANULADA') as polizas_anuladas,
  coalesce(sum(b.prima_mxn), 0::numeric) as prima_total_mxn,
  coalesce(sum(b.prima_mxn) filter (where b.estatus = 'EN_VIGOR'), 0::numeric) as prima_vigente_mxn,
  case when count(*) > 0
       then coalesce(sum(b.prima_mxn), 0::numeric) / count(*)
       else 0::numeric
  end as prima_promedio_mxn,
  coalesce(sum(coalesce(ca.prima_anual_snapshot, b.prima_mxn) * coalesce(ca.base_factor, 0)::numeric / 100.0), 0::numeric) as comision_base_mxn,
  coalesce(sum(coalesce(ca.puntos_total, 0)), 0::numeric) as puntos_totales,
  coalesce(sum(coalesce(ca.puntos_total, 0)), 0::numeric) as momentum_vita,
  min(b.fecha_emision) as primera_emision,
  max(b.fecha_emision) as ultima_emision,
  max(b.anulada_at) as ultima_cancelacion,
  max(b.updated_at) as ultima_actualizacion
from base b
left join cache ca on ca.poliza_id = b.poliza_id
group by b.asesor_id, b.usuario_id, b.usuario_email, b.usuario_nombre;

comment on view public.vw_polizas_metricas is 'Agregados de pólizas por asesor: conteos, primas, comisiones base y Momentum Vita (puntos acumulados).';

-- -----------------------------------------------------------------------------
-- vw_cancelaciones_indices
-- -----------------------------------------------------------------------------
drop view if exists public.vw_cancelaciones_indices;
create view public.vw_cancelaciones_indices as
with datos as (
  select
    p.id,
    c.asesor_id,
    p.fecha_emision,
    p.anulada_at
  from public.polizas p
  join public.clientes c on c.id = p.cliente_id
),
rangos as (
  select
    generate_series(
      coalesce(date_trunc('month', (select min(fecha_emision) from datos)), date_trunc('month', current_date)),
      coalesce(date_trunc('month', (select max(coalesce(anulada_at::date, fecha_emision)) from datos)), date_trunc('month', current_date)),
      interval '1 month'
    )::date as periodo
),
periodos as (
  select d.asesor_id, r.periodo, (r.periodo + interval '1 month')::date as periodo_fin
  from rangos r
  join (select distinct asesor_id from datos) d on true
)
select
  pr.asesor_id,
  u.id as usuario_id,
  u.email as usuario_email,
  u.nombre as usuario_nombre,
  pr.periodo as periodo_mes,
  extract(year from pr.periodo)::int as anio,
  extract(month from pr.periodo)::int as mes,
  count(d.*) filter (
    where d.fecha_emision >= pr.periodo
      and d.fecha_emision < pr.periodo_fin
  ) as polizas_emitidas,
  count(d.*) filter (
    where d.anulada_at is not null
      and d.anulada_at >= pr.periodo
      and d.anulada_at < pr.periodo_fin
  ) as polizas_canceladas,
  count(d.*) filter (
    where d.fecha_emision < pr.periodo_fin
      and (d.anulada_at is null or d.anulada_at >= pr.periodo_fin)
  ) as polizas_vigentes_al_cierre,
  count(d.*) filter (
    where d.anulada_at is not null
      and d.anulada_at >= pr.periodo - interval '12 months'
      and d.anulada_at < pr.periodo_fin
      and d.fecha_emision >= pr.periodo - interval '12 months'
  ) as cancelaciones_12m,
  count(d.*) filter (
    where d.fecha_emision >= pr.periodo - interval '12 months'
      and d.fecha_emision < pr.periodo_fin
  ) as emisiones_12m,
  case
    when count(d.*) filter (
           where d.fecha_emision >= pr.periodo - interval '12 months'
             and d.fecha_emision < pr.periodo_fin
         ) > 0
    then round(
           1 - (
             count(d.*) filter (
               where d.anulada_at is not null
                 and d.anulada_at >= pr.periodo - interval '12 months'
                 and d.anulada_at < pr.periodo_fin
                 and d.fecha_emision >= pr.periodo - interval '12 months'
             )::numeric
             /
             count(d.*) filter (
               where d.fecha_emision >= pr.periodo - interval '12 months'
                 and d.fecha_emision < pr.periodo_fin
             )
           ),
           4
         )
    else null
  end as indice_limra,
  case
    when count(d.*) filter (
           where d.fecha_emision < pr.periodo_fin
             and (d.anulada_at is null or d.anulada_at >= pr.periodo_fin)
         ) > 0
    then round(
           1 - (
             count(d.*) filter (
               where d.anulada_at is not null
                 and d.anulada_at >= pr.periodo
                 and d.anulada_at < pr.periodo_fin
             )::numeric
             /
             count(d.*) filter (
               where d.fecha_emision < pr.periodo_fin
                 and (d.anulada_at is null or d.anulada_at >= pr.periodo_fin)
             )
           ),
           4
         )
    else null
  end as indice_igc,
  (
    count(d.*) filter (
      where d.fecha_emision >= pr.periodo
        and d.fecha_emision < pr.periodo_fin
    )
    -
    count(d.*) filter (
      where d.anulada_at is not null
        and d.anulada_at >= pr.periodo
        and d.anulada_at < pr.periodo_fin
    )
  ) as momentum_neto
from periodos pr
left join datos d on d.asesor_id is not distinct from pr.asesor_id
  and (
    d.fecha_emision < pr.periodo_fin
    or (d.anulada_at is not null and d.anulada_at >= pr.periodo - interval '12 months')
  )
left join public.usuarios u on u.id_auth = pr.asesor_id
group by pr.asesor_id, u.id, u.email, u.nombre, pr.periodo
order by pr.periodo, pr.asesor_id;

comment on view public.vw_cancelaciones_indices is 'Métricas mensuales de pólizas emitidas, cancelaciones y persistencia (LIMRA / IGC) por asesor.';

-- -----------------------------------------------------------------------------
-- vw_rc_metricas
-- -----------------------------------------------------------------------------
drop view if exists public.vw_rc_metricas;
create view public.vw_rc_metricas as
with prospectos_agg as (
  select
    p.agente_id,
    count(*) as prospectos_total,
    count(*) filter (where p.estado in ('con_cita','seguimiento')) as reclutas_calidad,
    count(*) filter (where p.estado = 'con_cita') as prospectos_con_cita,
    count(*) filter (where p.estado = 'seguimiento') as prospectos_seguimiento,
    count(*) filter (where p.estado = 'descartado') as prospectos_descartados
  from public.prospectos p
  group by p.agente_id
),
polizas_agg as (
  select
    u.id as usuario_id,
    c.asesor_id,
    count(*) as polizas_total,
    count(*) filter (where p.estatus = 'EN_VIGOR') as polizas_vigentes,
    count(*) filter (where p.estatus = 'ANULADA') as polizas_anuladas
  from public.polizas p
  join public.clientes c on c.id = p.cliente_id
  left join public.usuarios u on u.id_auth = c.asesor_id
  group by u.id, c.asesor_id
),
usuarios_base as (
  select distinct coalesce(pa.agente_id, pol.usuario_id) as usuario_id
  from prospectos_agg pa
  full outer join polizas_agg pol on pol.usuario_id = pa.agente_id
)
select
  ub.usuario_id,
  case
    when pol.asesor_id is not null then pol.asesor_id
    when u.id_auth is not null and u.id_auth::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then u.id_auth
    else null
  end as asesor_auth_id,
  u.email as usuario_email,
  u.nombre as usuario_nombre,
  coalesce(pa.prospectos_total, 0) as prospectos_total,
  coalesce(pa.reclutas_calidad, 0) as reclutas_calidad,
  coalesce(pa.prospectos_con_cita, 0) as prospectos_con_cita,
  coalesce(pa.prospectos_seguimiento, 0) as prospectos_seguimiento,
  coalesce(pa.prospectos_descartados, 0) as prospectos_descartados,
  coalesce(pol.polizas_total, 0) as polizas_total,
  coalesce(pol.polizas_vigentes, 0) as polizas_vigentes,
  coalesce(pol.polizas_anuladas, 0) as polizas_anuladas,
  case
    when coalesce(pol.polizas_total, 0) > 0
      then round(coalesce(pol.polizas_vigentes, 0)::numeric / pol.polizas_total, 4)
    else null
  end as rc_vigencia,
  case
    when coalesce(pa.prospectos_total, 0) > 0
      then round(coalesce(pa.reclutas_calidad, 0)::numeric / pa.prospectos_total, 4)
    else null
  end as reclutas_calidad_ratio,
  case
    when (coalesce(pol.polizas_vigentes, 0) + coalesce(pol.polizas_anuladas, 0)) > 0
      then round(
        coalesce(pol.polizas_vigentes, 0)::numeric /
        (coalesce(pol.polizas_vigentes, 0) + coalesce(pol.polizas_anuladas, 0)),
        4
      )
    else null
  end as permanencia
from usuarios_base ub
left join prospectos_agg pa on pa.agente_id = ub.usuario_id
left join polizas_agg pol on pol.usuario_id = ub.usuario_id
left join public.usuarios u on u.id = ub.usuario_id;

comment on view public.vw_rc_metricas is 'Consolida métricas de reclutas de calidad (prospectos) y permanencia de pólizas por usuario/asesor.';
