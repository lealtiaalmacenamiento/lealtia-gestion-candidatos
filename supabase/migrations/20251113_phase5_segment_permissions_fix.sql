-- Phase 5: Ajuste de permisos para asignación de segmentos
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- Permitir que el servicio (service_role) actúe en nombre de supervisores
-- -----------------------------------------------------------------------------
create or replace function public.assign_user_segment(
  p_usuario_id bigint,
  p_segment_id uuid,
  p_assigned_by bigint default null
) returns public.user_segments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_segments%rowtype;
  v_actor bigint := p_assigned_by;
  v_actor_role text;
  v_actor_active boolean;
  v_auth_uid uuid := auth.uid();
  v_is_service boolean := (jwt_role() = 'service_role');
begin
  if v_actor is null and v_auth_uid is not null then
    select id
      into v_actor
    from public.usuarios
    where id_auth = v_auth_uid
    limit 1;
  end if;

  if v_actor is null then
    raise exception 'permiso denegado (actor inválido)';
  end if;

  select lower(rol), activo
    into v_actor_role, v_actor_active
  from public.usuarios
  where id = v_actor
  limit 1;

  if v_actor_role is null or not coalesce(v_actor_active, false) then
    raise exception 'permiso denegado (actor inexistente o inactivo)';
  end if;

  if v_actor_role not in ('supervisor', 'admin') then
    raise exception 'permiso denegado (requiere rol supervisor o superior)';
  end if;

  if not v_is_service then
    if v_auth_uid is null then
      raise exception 'permiso denegado (sesión inválida)';
    end if;

    perform 1
    from public.usuarios
    where id = v_actor
      and id_auth = v_auth_uid;

    if not found then
      raise exception 'permiso denegado (no coincide usuario autenticado)';
    end if;
  end if;

  insert into public.user_segments (usuario_id, segment_id, assigned_by)
  values (p_usuario_id, p_segment_id, v_actor)
  on conflict (usuario_id, segment_id) do update
    set assigned_by = coalesce(excluded.assigned_by, user_segments.assigned_by),
        assigned_at = timezone('utc'::text, now())
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.remove_user_segment(
  p_usuario_id bigint,
  p_segment_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service boolean := (jwt_role() = 'service_role');
begin
  if not public.is_super_role() and not v_is_service then
    raise exception 'permiso denegado (requiere rol supervisor o superior)';
  end if;

  delete from public.user_segments
  where usuario_id = p_usuario_id
    and segment_id = p_segment_id;

  return found;
end;
$$;
