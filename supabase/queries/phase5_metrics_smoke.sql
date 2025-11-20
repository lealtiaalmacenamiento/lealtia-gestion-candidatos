-- Quick smoke test for Phase 5 reporting views
select * from public.vw_polizas_metricas limit 20;
select * from public.vw_cancelaciones_indices order by periodo_mes desc, asesor_id limit 20;
select * from public.vw_rc_metricas limit 20;
