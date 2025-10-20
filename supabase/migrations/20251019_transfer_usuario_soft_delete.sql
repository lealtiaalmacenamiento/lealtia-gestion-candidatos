-- Soft delete support for producto_parametros and reassignment helper for usuario eliminations

create or replace function transfer_reassign_usuario(p_old_id bigint, p_new_id bigint, p_actor_email text default null)
returns json
language plpgsql
as $$
declare
  old_usr record;
  new_usr record;
  moved_prospectos bigint := 0;
  moved_planificaciones bigint := 0;
  moved_agente_meta bigint := 0;
  moved_clientes bigint := 0;
  moved_citas_agente bigint := 0;
  moved_citas_super bigint := 0;
begin
  if p_old_id = p_new_id then
    raise exception 'El usuario destino debe ser diferente al usuario original';
  end if;

  select id, email, rol, activo, id_auth into old_usr from usuarios where id = p_old_id;
  if not found then
    raise exception 'Usuario origen no existe';
  end if;

  select id, email, rol, activo, id_auth into new_usr from usuarios where id = p_new_id;
  if not found then
    raise exception 'Usuario destino no existe';
  end if;
  if not new_usr.activo then
    raise exception 'El usuario destino no está activo';
  end if;
  if new_usr.id_auth is null then
    raise exception 'Usuario destino no tiene id_auth asignado';
  end if;

  update prospectos
     set agente_id = new_usr.id
   where agente_id = old_usr.id;
  get diagnostics moved_prospectos = row_count;

  update planificaciones
     set agente_id = new_usr.id
   where agente_id = old_usr.id;
  get diagnostics moved_planificaciones = row_count;

  update agente_meta
     set usuario_id = new_usr.id
   where usuario_id = old_usr.id;
  get diagnostics moved_agente_meta = row_count;

  if old_usr.id_auth is not null then
    update clientes
       set asesor_id = new_usr.id_auth
     where asesor_id = old_usr.id_auth;
    get diagnostics moved_clientes = row_count;

    update citas
       set agente_id = new_usr.id_auth
     where agente_id = old_usr.id_auth;
    get diagnostics moved_citas_agente = row_count;

    update citas
       set supervisor_id = new_usr.id_auth
     where supervisor_id = old_usr.id_auth;
    get diagnostics moved_citas_super = row_count;
  end if;

  delete from usuarios where id = old_usr.id;

  return json_build_object(
    'prospectos', moved_prospectos,
    'planificaciones', moved_planificaciones,
    'agente_meta', moved_agente_meta,
    'clientes', moved_clientes,
    'citas_agente', moved_citas_agente,
    'citas_supervisor', moved_citas_super
  );
end;
$$;

create index if not exists idx_producto_parametros_activo on producto_parametros(activo);
