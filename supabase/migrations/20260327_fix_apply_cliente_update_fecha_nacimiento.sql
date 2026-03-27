-- Agrega fecha_nacimiento al SET de apply_cliente_update
-- Antes no se persistía al aprobar una solicitud de cambio de cliente.

CREATE OR REPLACE FUNCTION public.apply_cliente_update(p_request_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
 AS $function$
 DECLARE
   v_cliente_id uuid;
   v_payload jsonb;
   r_old public.clientes%ROWTYPE;
   r_new public.clientes%ROWTYPE;
 BEGIN
   IF NOT public.is_super_role() THEN
     RAISE EXCEPTION 'permiso denegado (se requiere supervisor/super_usuario)';
   END IF;

   SELECT cliente_id, payload_propuesto
     INTO v_cliente_id, v_payload
   FROM public.cliente_update_requests
   WHERE id = p_request_id AND estado = 'PENDIENTE'
   FOR UPDATE;

   IF NOT FOUND THEN
     RAISE EXCEPTION 'solicitud no encontrada o no pendiente';
   END IF;

   SELECT * INTO r_old FROM public.clientes WHERE id = v_cliente_id FOR UPDATE;

   UPDATE public.clientes SET
     primer_nombre      = COALESCE(UPPER(TRIM(v_payload->>'primer_nombre')), primer_nombre),
     segundo_nombre     = COALESCE(UPPER(TRIM(v_payload->>'segundo_nombre')), segundo_nombre),
     primer_apellido    = COALESCE(UPPER(TRIM(v_payload->>'primer_apellido')), primer_apellido),
     segundo_apellido   = COALESCE(UPPER(TRIM(v_payload->>'segundo_apellido')), segundo_apellido),
     telefono_celular   = COALESCE(TRIM(v_payload->>'telefono_celular'), telefono_celular),
     correo             = COALESCE(LOWER(TRIM(v_payload->>'correo')), correo),
     fecha_nacimiento   = CASE
                            WHEN v_payload ? 'fecha_nacimiento'
                             AND v_payload->>'fecha_nacimiento' IS NOT NULL
                             AND v_payload->>'fecha_nacimiento' <> ''
                            THEN (v_payload->>'fecha_nacimiento')::date
                            ELSE fecha_nacimiento
                          END,
     full_name_normalizado = UPPER(TRIM(
       COALESCE(v_payload->>'primer_nombre', primer_nombre) || ' ' ||
       COALESCE(v_payload->>'segundo_nombre', COALESCE(segundo_nombre,'')) || ' ' ||
       COALESCE(v_payload->>'primer_apellido', primer_apellido) || ' ' ||
       COALESCE(v_payload->>'segundo_apellido', segundo_apellido)
     )),
     updated_at = now()
   WHERE id = v_cliente_id;

   SELECT * INTO r_new FROM public.clientes WHERE id = v_cliente_id;

   INSERT INTO public.cliente_historial (
     id, cliente_id, cambio_tipo, payload_old, payload_new, actor_id, creado_at
   ) VALUES (
     gen_random_uuid(), v_cliente_id, 'APROBACION', to_jsonb(r_old), to_jsonb(r_new), auth.uid(), now()
   );

   UPDATE public.cliente_update_requests
   SET estado = 'APROBADA', resuelto_at = now(), resuelto_por = auth.uid()
   WHERE id = p_request_id;
 END;
 $function$;
