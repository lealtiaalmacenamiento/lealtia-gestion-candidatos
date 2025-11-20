-- Phase 5: supporting indexes for reporting views
set statement_timeout = 0;

-- Ensure joins by asesor/auth_id resolve quickly when aggregating metrics
create index if not exists idx_clientes_asesor on public.clientes(asesor_id) where asesor_id is not null;
create index if not exists idx_usuarios_id_auth on public.usuarios(id_auth) where id_auth is not null;

-- Speed up temporal slices used by vw_polizas_metricas and vw_cancelaciones_indices
create index if not exists idx_polizas_fecha_emision on public.polizas(fecha_emision);
create index if not exists idx_polizas_anulada_at on public.polizas(anulada_at);
create index if not exists idx_polizas_cliente_fecha_emision on public.polizas(cliente_id, fecha_emision);
create index if not exists idx_polizas_cliente_anulada on public.polizas(cliente_id, anulada_at);
