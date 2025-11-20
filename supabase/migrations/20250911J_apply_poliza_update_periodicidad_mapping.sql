-- Mejora: mapeo de valores legacy de periodicidad (ANUAL, SEMESTRAL, TRIMESTRAL, MENSUAL) a enum A/S/T/M
-- Fecha: 2025-09-11

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
  v_periodicidad_raw text;
  v_periodicidad_enum periodicidad_pago;
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor)';
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

  -- Normalizar periodicidad
  v_periodicidad_raw := NULLIF(v_payload->>'periodicidad_pago','');
  IF v_periodicidad_raw IS NOT NULL THEN
    v_periodicidad_raw := upper(trim(v_periodicidad_raw));
    IF v_periodicidad_raw IN ('A','ANUAL','ANUALIDAD') THEN
      v_periodicidad_enum := 'A';
    ELSIF v_periodicidad_raw IN ('S','SEMESTRAL','SEMESTRA') THEN
      v_periodicidad_enum := 'S';
    ELSIF v_periodicidad_raw IN ('T','TRIMESTRAL','TRIMESTRE') THEN
      v_periodicidad_enum := 'T';
    ELSIF v_periodicidad_raw IN ('M','MENSUAL','MES') THEN
      v_periodicidad_enum := 'M';
    ELSIF v_periodicidad_raw IN ('A','S','T','M') THEN
      v_periodicidad_enum := v_periodicidad_raw::periodicidad_pago; -- redundante
    ELSE
      -- Valor inválido: ignorar (no aplica cambio)
      v_periodicidad_enum := NULL;
    END IF;
  END IF;

  -- Actualiza campos (robusto contra strings vacíos)
  UPDATE polizas SET
    numero_poliza         = COALESCE(NULLIF(TRIM(v_payload->>'numero_poliza'),''), numero_poliza),
    estatus               = COALESCE((NULLIF(v_payload->>'estatus',''))::estatus_poliza, estatus),
    fecha_emision         = COALESCE((NULLIF(v_payload->>'fecha_emision',''))::date, fecha_emision),
    fecha_renovacion      = COALESCE((NULLIF(v_payload->>'fecha_renovacion',''))::date, fecha_renovacion),
    forma_pago            = COALESCE((NULLIF(v_payload->>'forma_pago',''))::forma_pago, forma_pago),
    periodicidad_pago     = COALESCE(v_periodicidad_enum, periodicidad_pago),
    dia_pago              = COALESCE((NULLIF(v_payload->>'dia_pago',''))::int, dia_pago),
    prima_input           = COALESCE((NULLIF(v_payload->>'prima_input',''))::numeric, prima_input),
    prima_moneda          = COALESCE((NULLIF(v_payload->>'prima_moneda',''))::moneda_poliza, prima_moneda),
    sa_input              = COALESCE((NULLIF(v_payload->>'sa_input',''))::numeric, sa_input),
    sa_moneda             = COALESCE((NULLIF(v_payload->>'sa_moneda',''))::moneda_poliza, sa_moneda),
    producto_parametro_id = COALESCE((NULLIF(v_payload->>'producto_parametro_id',''))::uuid, producto_parametro_id),
    meses_check           = COALESCE((CASE WHEN jsonb_typeof(v_payload->'meses_check')='object' THEN v_payload->'meses_check' END), meses_check),
    updated_at            = now()
  WHERE id = v_poliza_id;

  SELECT * INTO r_new FROM polizas WHERE id = v_poliza_id;

  v_old_prima := r_old.prima_input;
  v_new_prima := r_new.prima_input;
  IF v_old_prima IS DISTINCT FROM v_new_prima THEN
    INSERT INTO historial_costos_poliza (
      id, poliza_id, prima_anual_old, prima_anual_new, porcentaje_comision_old, porcentaje_comision_new, actor_id, creado_at
    ) VALUES (
      gen_random_uuid(), v_poliza_id, v_old_prima, v_new_prima, NULL, NULL, auth.uid(), now()
    );
  END IF;

  UPDATE poliza_update_requests
  SET estado = 'APROBADA', resuelto_at = now(), resuelto_por = auth.uid()
  WHERE id = p_request_id;

  PERFORM recalc_puntos_poliza(v_poliza_id);
END;
$$ LANGUAGE plpgsql;
