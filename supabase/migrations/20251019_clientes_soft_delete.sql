-- Soft delete support for clientes

alter table clientes
  add column if not exists activo boolean not null default true;

alter table clientes
  add column if not exists inactivado_at timestamptz null;

alter table clientes
  add column if not exists inactivado_por integer null references public.usuarios(id);

create index if not exists idx_clientes_activo on clientes(activo);
