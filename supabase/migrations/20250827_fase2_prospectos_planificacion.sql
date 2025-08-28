-- Fase 2: Tablas prospectos y planificaciones
-- idempotencia simple: crear si no existen

create table if not exists prospectos (
  id bigserial primary key,
  agente_id bigint not null references usuarios(id) on delete cascade,
  anio smallint not null,
  semana_iso smallint not null,
  nombre text not null,
  telefono text,
  notas text,
  estado text not null default 'pendiente' check (estado in ('pendiente','seguimiento','con_cita','descartado')),
  fecha_cita date,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create index if not exists idx_prospectos_agente_semana on prospectos(agente_id, anio, semana_iso);
create index if not exists idx_prospectos_estado on prospectos(estado);

create table if not exists planificaciones (
  id bigserial primary key,
  agente_id bigint not null references usuarios(id) on delete cascade,
  anio smallint not null,
  semana_iso smallint not null,
  prima_anual_promedio numeric(12,2) not null default 30000,
  porcentaje_comision numeric(5,2) not null default 35,
  bloques jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz,
  constraint planif_unica_agente_semana unique(agente_id, anio, semana_iso)
);

create index if not exists idx_planif_agente_semana on planificaciones(agente_id, anio, semana_iso);
