-- Phase 5 follow-up: segment utilities & stricter RLS
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- Segment assignment helpers
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
  v_actor bigint;
begin
  if not public.is_super_role() then
    raise exception 'permiso denegado (requiere rol supervisor o superior)';
  end if;

  v_actor := p_assigned_by;
  if v_actor is null then
    select id into v_actor from public.usuarios where id_auth = auth.uid();
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

comment on function public.assign_user_segment(bigint, uuid, bigint)
  is 'Asigna un segmento a un usuario (solo para roles superiores); crea o actualiza la fila en user_segments.';

create or replace function public.assign_user_segment_by_name(
  p_usuario_id bigint,
  p_segment_name text,
  p_assigned_by bigint default null
) returns public.user_segments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segment_id uuid;
begin
  if p_segment_name is null or length(trim(p_segment_name)) = 0 then
    raise exception 'segmento inválido';
  end if;

  select id into v_segment_id
  from public.segments
  where lower(name) = lower(trim(p_segment_name))
    and active is true
  limit 1;

  if v_segment_id is null then
    raise exception 'segmento % no encontrado o inactivo', p_segment_name;
  end if;

  return public.assign_user_segment(p_usuario_id, v_segment_id, p_assigned_by);
end;
$$;

comment on function public.assign_user_segment_by_name(bigint, text, bigint)
  is 'Wrapper de conveniencia para asignar segmentos por nombre (case-insensitive).';

create or replace function public.remove_user_segment(
  p_usuario_id bigint,
  p_segment_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_role() then
    raise exception 'permiso denegado (requiere rol supervisor o superior)';
  end if;

  delete from public.user_segments
  where usuario_id = p_usuario_id
    and segment_id = p_segment_id;

  return found;
end;
$$;

comment on function public.remove_user_segment(bigint, uuid)
  is 'Elimina una asignación de segmento para un usuario (solo supervisores/superiores).';

create or replace function public.remove_user_segment_by_name(
  p_usuario_id bigint,
  p_segment_name text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segment_id uuid;
begin
  if p_segment_name is null or length(trim(p_segment_name)) = 0 then
    raise exception 'segmento inválido';
  end if;

  select id into v_segment_id
  from public.segments
  where lower(name) = lower(trim(p_segment_name))
  limit 1;

  if v_segment_id is null then
    raise exception 'segmento % no encontrado', p_segment_name;
  end if;

  return public.remove_user_segment(p_usuario_id, v_segment_id);
end;
$$;

comment on function public.remove_user_segment_by_name(bigint, text)
  is 'Wrapper para remover segmentos especificando el nombre.';

-- -----------------------------------------------------------------------------
-- RLS adjustments
-- -----------------------------------------------------------------------------
-- Segments: solo visibles cuando activos (salvo roles superiores)
drop policy if exists segments_select_all on public.segments;
drop policy if exists segments_manage_super on public.segments;
drop policy if exists segments_select_visible on public.segments;

create policy segments_select_visible on public.segments
  for select
  using (active or public.is_super_role());

create policy segments_manage_super on public.segments
  for all
  using (public.is_super_role())
  with check (public.is_super_role());

-- User segments: lectura restringida al propio usuario (o superiores)
drop policy if exists user_segments_super_manage on public.user_segments;
drop policy if exists user_segments_select_all on public.user_segments;
drop policy if exists user_segments_manage_super on public.user_segments;
drop policy if exists user_segments_select_self on public.user_segments;
drop policy if exists user_segments_manage on public.user_segments;

create policy user_segments_select_self on public.user_segments
  for select
  using (
    public.is_super_role()
    or exists (
      select 1
      from public.usuarios u
      where u.id = usuario_id
        and u.id_auth = auth.uid()
    )
  );

create policy user_segments_manage_super on public.user_segments
  for all
  using (public.is_super_role())
  with check (public.is_super_role());

-- Campaign progress: permitir consultar solo propias filas o roles superiores
drop policy if exists campaign_progress_select_all on public.campaign_progress;
drop policy if exists campaign_progress_select_self on public.campaign_progress;

create policy campaign_progress_select_self on public.campaign_progress
  for select
  using (
    public.is_super_role()
    or exists (
      select 1
      from public.usuarios u
      where u.id = usuario_id
        and u.id_auth = auth.uid()
    )
  );
-- mantener política de gestión para roles superiores (ya creada en migración previa)

-- End of migration
