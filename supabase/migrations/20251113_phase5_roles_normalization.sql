-- Phase 5: Normalización de roles (superusuario ➜ supervisor)
set check_function_bodies = off;

alter table public.usuarios
  drop constraint if exists usuarios_rol_check;

-- -----------------------------------------------------------------------------
-- Re-map legacy role values without deleting existing data
-- -----------------------------------------------------------------------------
update public.usuarios
set rol = 'supervisor'
where rol is not null
  and lower(rol) in ('superusuario', 'super usuario', 'super_usuario', 'editor')
  and rol <> 'supervisor';

update public.usuarios
set rol = 'viewer'
where rol is not null
  and lower(rol) in ('lector')
  and rol <> 'viewer';

alter table public.usuarios
  add constraint usuarios_rol_check
  check (rol in ('admin','supervisor','viewer','agente'));
