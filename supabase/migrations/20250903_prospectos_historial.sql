-- Create table to track prospecto estado changes and note additions
create table if not exists public.prospectos_historial (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  prospecto_id bigint not null references public.prospectos(id) on delete cascade,
  agente_id bigint,
  usuario_email text,
  estado_anterior text,
  estado_nuevo text,
  nota_agregada boolean default false,
  notas_anteriores text,
  notas_nuevas text
);

create index if not exists idx_prospectos_historial_created_at on public.prospectos_historial (created_at desc);
create index if not exists idx_prospectos_historial_prospecto on public.prospectos_historial (prospecto_id);