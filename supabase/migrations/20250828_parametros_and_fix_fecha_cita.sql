-- Creación directa (create table if not exists no duplicará)
create table if not exists "Parametros" (
  id bigserial primary key,
  tipo text not null,
  clave text,
  valor text,
  descripcion text,
  actualizado_por text,
  actualizado_en timestamptz default now()
);
create index if not exists idx_parametros_tipo on "Parametros"(tipo);
create unique index if not exists idx_parametros_tipo_clave on "Parametros"(tipo, clave);

-- Seed de parámetros fase2 (solo si no existen)
insert into "Parametros"(tipo, clave, valor, descripcion)
select 'fase2','meta_prospectos_semana','30','Meta semanal de prospectos'
where not exists (select 1 from "Parametros" where tipo='fase2' and clave='meta_prospectos_semana');

insert into "Parametros"(tipo, clave, valor, descripcion)
select 'fase2','meta_citas_semana','5','Meta semanal de citas'
where not exists (select 1 from "Parametros" where tipo='fase2' and clave='meta_citas_semana');

-- NOTA: Ejecutar manualmente en DB si la columna sigue siendo date:
-- ALTER TABLE prospectos ALTER COLUMN fecha_cita TYPE timestamptz USING (fecha_cita::timestamptz);
