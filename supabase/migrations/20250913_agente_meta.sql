-- Tabla para metas/indicadores de agente
create table if not exists public.agente_meta (
  usuario_id integer primary key references public.usuarios(id) on delete cascade,
  fecha_conexion_text text, -- almacenado como D/M/YYYY (ej. 17/3/2025)
  objetivo integer,
  updated_at timestamptz not null default now()
);

-- Índices útiles
create index if not exists idx_agente_meta_objetivo on public.agente_meta(objetivo);

-- RLS/policies pueden configurarse posteriormente; las APIs usan service role para upsert controlado
