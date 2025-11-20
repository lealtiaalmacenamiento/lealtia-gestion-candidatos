-- Fase 3 – Sprint 4: Flujo de aprobación de cambios a cliente
-- Fecha: 2025-09-08
-- Objetivo: funciones submit/apply/reject y políticas RLS mínimas

-- Helpers para roles desde JWT
CREATE OR REPLACE FUNCTION jwt_role()
RETURNS text
AS $$
BEGIN
  RETURN COALESCE((current_setting('request.jwt.claims', true)::jsonb)->>'role', '');
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION is_super_role()
RETURNS boolean
AS $$
BEGIN
  RETURN jwt_role() IN ('supervisor','admin');
END;
$$ LANGUAGE plpgsql STABLE;

-- Submit de solicitud de cambio (asesor)
CREATE OR REPLACE FUNCTION submit_cliente_update(p_cliente_id uuid, p_payload jsonb)
RETURNS uuid
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload inválido';
  END IF;

  INSERT INTO cliente_update_requests (
    id, cliente_id, solicitante_id, payload_propuesto, estado, creado_at
  ) VALUES (
    gen_random_uuid(), p_cliente_id, auth.uid(), p_payload, 'PENDIENTE', now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Aplicar aprobación (supervisor)
CREATE OR REPLACE FUNCTION apply_cliente_update(p_request_id uuid)
RETURNS void
AS $$
DECLARE
  v_cliente_id uuid;
  v_payload jsonb;
  r_old clientes%ROWTYPE;
  r_new clientes%ROWTYPE;
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor)';
  END IF;

  SELECT cliente_id, payload_propuesto
    INTO v_cliente_id, v_payload
  FROM cliente_update_requests
  WHERE id = p_request_id AND estado = 'PENDIENTE'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud no encontrada o no pendiente';
  END IF;

  SELECT * INTO r_old FROM clientes WHERE id = v_cliente_id FOR UPDATE;

  -- Actualiza campos permitidos (usa COALESCE para mantener si no viene en payload)
  UPDATE clientes SET
    primer_nombre      = COALESCE(UPPER(TRIM(v_payload->>'primer_nombre')), primer_nombre),
    segundo_nombre     = COALESCE(UPPER(TRIM(v_payload->>'segundo_nombre')), segundo_nombre),
    primer_apellido    = COALESCE(UPPER(TRIM(v_payload->>'primer_apellido')), primer_apellido),
    segundo_apellido   = COALESCE(UPPER(TRIM(v_payload->>'segundo_apellido')), segundo_apellido),
    telefono_celular   = COALESCE(TRIM(v_payload->>'telefono_celular'), telefono_celular),
    correo             = COALESCE(LOWER(TRIM(v_payload->>'correo')), correo),
    full_name_normalizado = UPPER(TRIM(
      COALESCE(v_payload->>'primer_nombre', primer_nombre) || ' ' ||
      COALESCE(v_payload->>'segundo_nombre', COALESCE(segundo_nombre,'')) || ' ' ||
      COALESCE(v_payload->>'primer_apellido', primer_apellido) || ' ' ||
      COALESCE(v_payload->>'segundo_apellido', segundo_apellido)
    )),
    updated_at = now()
  WHERE id = v_cliente_id;

  SELECT * INTO r_new FROM clientes WHERE id = v_cliente_id;

  INSERT INTO cliente_historial (
    id, cliente_id, cambio_tipo, payload_old, payload_new, actor_id, creado_at
  ) VALUES (
    gen_random_uuid(), v_cliente_id, 'APROBACION', to_jsonb(r_old), to_jsonb(r_new), auth.uid(), now()
  );

  UPDATE cliente_update_requests
  SET estado = 'APROBADA', resuelto_at = now(), resuelto_por = auth.uid()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql;

-- Rechazar solicitud (supervisor)
CREATE OR REPLACE FUNCTION reject_cliente_update(p_request_id uuid, p_motivo text)
RETURNS void
AS $$
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor)';
  END IF;

  UPDATE cliente_update_requests
  SET estado = 'RECHAZADA', motivo_rechazo = COALESCE(p_motivo,'') , resuelto_at = now(), resuelto_por = auth.uid()
  WHERE id = p_request_id AND estado = 'PENDIENTE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud no encontrada o no pendiente';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Políticas RLS mínimas
-- clientes: SELECT por asesor o super; UPDATE sólo super
DROP POLICY IF EXISTS sel_clientes ON clientes;
CREATE POLICY sel_clientes ON clientes
  FOR SELECT TO authenticated
  USING (asesor_id = auth.uid() OR is_super_role());

DROP POLICY IF EXISTS upd_clientes_super ON clientes;
CREATE POLICY upd_clientes_super ON clientes
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

-- cliente_update_requests: INSERT por solicitante; SELECT por solicitante o super
DROP POLICY IF EXISTS ins_cliente_update_requests ON cliente_update_requests;
CREATE POLICY ins_cliente_update_requests ON cliente_update_requests
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid());

DROP POLICY IF EXISTS sel_cliente_update_requests ON cliente_update_requests;
CREATE POLICY sel_cliente_update_requests ON cliente_update_requests
  FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid() OR is_super_role());

-- cliente_historial: SELECT sólo super
DROP POLICY IF EXISTS sel_cliente_historial ON cliente_historial;
CREATE POLICY sel_cliente_historial ON cliente_historial
  FOR SELECT TO authenticated
  USING (is_super_role());
