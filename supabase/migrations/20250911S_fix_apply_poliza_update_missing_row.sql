-- Fix: SELECT ... FOR UPDATE en poliza_update_requests parecía no encontrar fila pese a estado=PENDIENTE
-- Acción: quitar FOR UPDATE en la lectura inicial de la solicitud y agregar diagnóstico detallado
-- Además: re-crear helper apply_poliza_update_dbg (faltaba en entorno remoto)
-- Fecha: 2025-09-11

CREATE OR REPLACE FUNCTION apply_poliza_update(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_poliza_id uuid;
  v_payload jsonb;
  v_estado text;
  r_old polizas%ROWTYPE;
  r_new polizas%ROWTYPE;
  v_old_prima numeric(14,2);
  v_new_prima numeric(14,2);
  v_periodicidad_raw text;
  v_periodicidad_txt text;
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor/super_usuario)';
  END IF;

  -- Leer la solicitud SIN FOR UPDATE (parece causar que no se devuelva fila en RLS)
  SELECT poliza_id, payload_propuesto, estado
    INTO v_poliza_id, v_payload, v_estado
  FROM poliza_update_requests
  WHERE id = p_request_id;

  IF v_poliza_id IS NULL THEN
    RAISE EXCEPTION 'solicitud no encontrada';
  END IF;
  IF v_estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'solicitud no pendiente (estado=%)', v_estado;
  END IF;

  -- Bloquear la póliza (evita condiciones de carrera)
  SELECT * INTO r_old FROM polizas WHERE id = v_poliza_id FOR UPDATE;

  v_periodicidad_raw := NULLIF(v_payload->>'periodicidad_pago','');
  IF v_periodicidad_raw IS NOT NULL THEN
    v_periodicidad_raw := upper(trim(v_periodicidad_raw));
    IF v_periodicidad_raw IN ('A','ANUAL','ANUALIDAD') THEN v_periodicidad_txt := 'A';
    ELSIF v_periodicidad_raw IN ('S','SEMESTRAL','SEMESTRA') THEN v_periodicidad_txt := 'S';
    ELSIF v_periodicidad_raw IN ('T','TRIMESTRAL','TRIMESTRE') THEN v_periodicidad_txt := 'T';
    ELSIF v_periodicidad_raw IN ('M','MENSUAL','MES') THEN v_periodicidad_txt := 'M';
    ELSIF v_periodicidad_raw IN ('A','S','T','M') THEN v_periodicidad_txt := v_periodicidad_raw; ELSE v_periodicidad_txt := NULL; END IF;
  END IF;

  UPDATE polizas SET
    numero_poliza         = COALESCE(NULLIF(TRIM(v_payload->>'numero_poliza'),''), numero_poliza),
    estatus               = COALESCE(NULLIF(v_payload->>'estatus','')::estatus_poliza, estatus),
    fecha_emision         = COALESCE(NULLIF(v_payload->>'fecha_emision','')::date, fecha_emision),
    fecha_renovacion      = COALESCE(NULLIF(v_payload->>'fecha_renovacion','')::date, fecha_renovacion),
    forma_pago            = COALESCE(NULLIF(v_payload->>'forma_pago','')::forma_pago, forma_pago),
    periodicidad_pago     = COALESCE((CASE WHEN v_periodicidad_txt IS NOT NULL THEN v_periodicidad_txt::public.periodicidad_pago END), periodicidad_pago),
    dia_pago              = COALESCE(NULLIF(v_payload->>'dia_pago','')::int, dia_pago),
    prima_input           = COALESCE(NULLIF(v_payload->>'prima_input','')::numeric, prima_input),
    prima_moneda          = COALESCE(NULLIF(v_payload->>'prima_moneda','')::moneda_poliza, prima_moneda),
    sa_input              = COALESCE(NULLIF(v_payload->>'sa_input','')::numeric, sa_input),
    sa_moneda             = COALESCE(NULLIF(v_payload->>'sa_moneda','')::moneda_poliza, sa_moneda),
    producto_parametro_id = COALESCE(NULLIF(v_payload->>'producto_parametro_id','')::uuid, producto_parametro_id),
    meses_check           = COALESCE((CASE WHEN jsonb_typeof(v_payload->'meses_check')='object' THEN v_payload->'meses_check' END), meses_check),
    updated_at            = now()
  WHERE id = v_poliza_id;

  SELECT * INTO r_new FROM polizas WHERE id = v_poliza_id;

  v_old_prima := r_old.prima_input;
  v_new_prima := r_new.prima_input;
  IF v_old_prima IS DISTINCT FROM v_new_prima THEN
    INSERT INTO historial_costos_poliza(
      id, poliza_id, prima_anual_old, prima_anual_new, porcentaje_comision_old, porcentaje_comision_new, actor_id, creado_at
    ) VALUES (
      gen_random_uuid(), v_poliza_id, v_old_prima, v_new_prima, NULL, NULL, auth.uid(), now()
    );
  END IF;

  UPDATE poliza_update_requests
  SET estado='APROBADA', resuelto_at=now(), resuelto_por=auth.uid()
  WHERE id = p_request_id AND estado='PENDIENTE';

  PERFORM recalc_puntos_poliza(v_poliza_id);
END;
$$;

-- Helper debug (jsonb) para inspeccionar por qué falla
CREATE OR REPLACE FUNCTION public.apply_poliza_update_dbg(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row poliza_update_requests%ROWTYPE;
  v_is_super boolean;
  v_poliza_before polizas%ROWTYPE;
  v_poliza_after polizas%ROWTYPE;
  v_err text;
  v_state text;
BEGIN
  v_is_super := is_super_role();
  SELECT * INTO v_row FROM poliza_update_requests WHERE id = p_request_id;
  IF v_row.poliza_id IS NOT NULL THEN
    SELECT * INTO v_poliza_before FROM polizas WHERE id = v_row.poliza_id;
  END IF;
  BEGIN
    PERFORM apply_poliza_update(p_request_id);
    IF v_row.poliza_id IS NOT NULL THEN
      SELECT * INTO v_poliza_after FROM polizas WHERE id = v_row.poliza_id;
    END IF;
    RETURN jsonb_build_object(
      'status','ok',
      'is_super', v_is_super,
      'request_row', to_jsonb(v_row),
      'poliza_before', to_jsonb(v_poliza_before),
      'poliza_after', to_jsonb(v_poliza_after)
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM; v_state := SQLSTATE;
    RETURN jsonb_build_object(
      'status','error',
      'is_super', v_is_super,
      'sqlstate', v_state,
      'error', v_err,
      'request_row', to_jsonb(v_row)
    );
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_poliza_update_dbg(uuid) TO authenticated, service_role;
