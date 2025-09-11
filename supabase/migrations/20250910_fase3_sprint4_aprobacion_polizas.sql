-- Fase 3 – Sprint 4: Flujo de aprobación de cambios de póliza
-- Fecha: 2025-09-10

-- Tabla de solicitudes de cambio de póliza
CREATE TABLE IF NOT EXISTS poliza_update_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poliza_id uuid NOT NULL REFERENCES polizas(id) ON DELETE CASCADE,
  solicitante_id uuid NOT NULL,
  payload_propuesto jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  motivo_rechazo text NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  resuelto_at timestamptz NULL,
  resuelto_por uuid NULL
);

-- sql-lint-disable-next-line
ALTER TABLE poliza_update_requests ENABLE ROW LEVEL SECURITY;

-- Helpers de rol (idempotentes)
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
  RETURN jwt_role() IN ('super_usuario','supervisor','admin');
END;
$$ LANGUAGE plpgsql STABLE;

-- Submit/update/reject funciones
CREATE OR REPLACE FUNCTION submit_poliza_update(p_poliza_id uuid, p_payload jsonb)
RETURNS uuid
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload inválido';
  END IF;

  INSERT INTO poliza_update_requests (
    id, poliza_id, solicitante_id, payload_propuesto, estado, creado_at
  ) VALUES (
    gen_random_uuid(), p_poliza_id, auth.uid(), p_payload, 'PENDIENTE', now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION apply_poliza_update(p_request_id uuid)
RETURNS void
AS $$
DECLARE
  v_poliza_id uuid;
  v_payload jsonb;
  r_old polizas%ROWTYPE;
  r_new polizas%ROWTYPE;
  v_old_prima numeric(14,2);
  v_new_prima numeric(14,2);
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor/super_usuario)';
  END IF;

  SELECT poliza_id, payload_propuesto
    INTO v_poliza_id, v_payload
  FROM poliza_update_requests
  WHERE id = p_request_id AND estado = 'PENDIENTE'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud no encontrada o no pendiente';
  END IF;

  SELECT * INTO r_old FROM polizas WHERE id = v_poliza_id FOR UPDATE;

  -- Actualiza sólo campos permitidos
  UPDATE polizas SET
    numero_poliza        = COALESCE(NULLIF(TRIM(v_payload->>'numero_poliza'),''), numero_poliza),
    estatus              = COALESCE((v_payload->>'estatus')::estatus_poliza, estatus),
    fecha_emision        = COALESCE((v_payload->>'fecha_emision')::date, fecha_emision),
    forma_pago           = COALESCE((v_payload->>'forma_pago')::forma_pago, forma_pago),
    prima_input          = COALESCE((v_payload->>'prima_input')::numeric, prima_input),
    prima_moneda         = COALESCE((v_payload->>'prima_moneda')::moneda_poliza, prima_moneda),
    sa_input             = COALESCE((v_payload->>'sa_input')::numeric, sa_input),
    sa_moneda            = COALESCE((v_payload->>'sa_moneda')::moneda_poliza, sa_moneda),
    producto_parametro_id= COALESCE((v_payload->>'producto_parametro_id')::uuid, producto_parametro_id),
    updated_at           = now()
  WHERE id = v_poliza_id;

  SELECT * INTO r_new FROM polizas WHERE id = v_poliza_id;

  -- Historial de costos si cambió prima_input
  v_old_prima := r_old.prima_input;
  v_new_prima := r_new.prima_input;
  IF v_old_prima IS DISTINCT FROM v_new_prima THEN
    INSERT INTO historial_costos_poliza (
      id, poliza_id, prima_anual_old, prima_anual_new, porcentaje_comision_old, porcentaje_comision_new, actor_id, creado_at
    ) VALUES (
      gen_random_uuid(), v_poliza_id, v_old_prima, v_new_prima, NULL, NULL, auth.uid(), now()
    );
  END IF;

  -- Marcar solicitud como aprobada
  UPDATE poliza_update_requests
  SET estado = 'APROBADA', resuelto_at = now(), resuelto_por = auth.uid()
  WHERE id = p_request_id;

  -- Recalcular puntos (en caso de que trigger no dispare por algún motivo)
  PERFORM recalc_puntos_poliza(v_poliza_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reject_poliza_update(p_request_id uuid, p_motivo text)
RETURNS void
AS $$
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor/super_usuario)';
  END IF;

  UPDATE poliza_update_requests
  SET estado = 'RECHAZADA', motivo_rechazo = COALESCE(p_motivo,''), resuelto_at = now(), resuelto_por = auth.uid()
  WHERE id = p_request_id AND estado = 'PENDIENTE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud no encontrada o no pendiente';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Políticas RLS
-- polizas SELECT por asesor del cliente dueño o super; UPDATE sólo super
DROP POLICY IF EXISTS sel_polizas ON polizas;
CREATE POLICY sel_polizas ON polizas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = polizas.cliente_id
        AND (c.asesor_id = auth.uid() OR is_super_role())
    )
  );

DROP POLICY IF EXISTS upd_polizas_super ON polizas;
CREATE POLICY upd_polizas_super ON polizas
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

-- poliza_update_requests: INSERT por solicitante; SELECT por solicitante o super
DROP POLICY IF EXISTS ins_poliza_update_requests ON poliza_update_requests;
CREATE POLICY ins_poliza_update_requests ON poliza_update_requests
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid());

DROP POLICY IF EXISTS sel_poliza_update_requests ON poliza_update_requests;
CREATE POLICY sel_poliza_update_requests ON poliza_update_requests
  FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid() OR is_super_role());

-- historial_costos_poliza: SELECT sólo super
DROP POLICY IF EXISTS sel_historial_costos_poliza ON historial_costos_poliza;
CREATE POLICY sel_historial_costos_poliza ON historial_costos_poliza
  FOR SELECT TO authenticated
  USING (is_super_role());
