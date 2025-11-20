-- Saneo definitivo de periodicidad_pago: migrar de enum inconsistente a un enum único
-- Fecha: 2025-09-11
-- Pasos:
-- 1. Detectar tipo actual de la columna polizas.periodicidad_pago.
-- 2. Renombrar enum viejo si su nombre no es 'periodicidad_pago'. (Si ya se llama periodicidad_pago, saltar.)
-- 3. Crear enum destino (periodicidad_pago) con valores ('A','S','T','M') si no existe.
-- 4. Alterar columna convirtiendo valores.
-- 5. Reemplazar función apply_poliza_update para usar el nuevo enum.
-- 6. (Opcional) Dropear enum viejo si queda sin dependencias.

DO $$
DECLARE
  v_col_typ text;
  v_exists boolean;
BEGIN
  -- Tipo actual de la columna
  SELECT at.typname
  INTO v_col_typ
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid AND c.relname='polizas'
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname='public'
  JOIN pg_type at ON at.oid = a.atttypid
  WHERE a.attname='periodicidad_pago';

  -- Crear enum destino si no existe
  SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE t.typname='periodicidad_pago' AND n.nspname='public') INTO v_exists;
  IF NOT v_exists THEN
    EXECUTE 'CREATE TYPE public.periodicidad_pago AS ENUM (''A'',''S'',''T'',''M'')';
  END IF;

  -- Si el tipo actual no es periodicidad_pago, migrar
  IF v_col_typ <> 'periodicidad_pago' THEN
    -- Asegurar que todos los valores existentes estén en el set permitido
    -- (Si hubiera otros, se podrían mapear aquí usando UPDATE previo.)
    EXECUTE $$ALTER TABLE public.polizas
              ALTER COLUMN periodicidad_pago TYPE public.periodicidad_pago
              USING (CASE
                        WHEN periodicidad_pago::text IN ('A','S','T','M') THEN periodicidad_pago::text::public.periodicidad_pago
                        ELSE NULL
                     END)$$;
  END IF;
END $$;

-- Reemplazar función con cast al enum final
CREATE OR REPLACE FUNCTION apply_poliza_update(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_poliza_id uuid;
  v_payload jsonb;
  r_old polizas%ROWTYPE;
  r_new polizas%ROWTYPE;
  v_old_prima numeric(14,2);
  v_new_prima numeric(14,2);
  v_periodicidad_raw text;
  v_periodicidad_txt text;
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

  v_periodicidad_raw := NULLIF(v_payload->>'periodicidad_pago','');
  IF v_periodicidad_raw IS NOT NULL THEN
    v_periodicidad_raw := upper(trim(v_periodicidad_raw));
    IF v_periodicidad_raw IN ('A','ANUAL','ANUALIDAD') THEN v_periodicidad_txt := 'A';
    ELSIF v_periodicidad_raw IN ('S','SEMESTRAL','SEMESTRA') THEN v_periodicidad_txt := 'S';
    ELSIF v_periodicidad_raw IN ('T','TRIMESTRAL','TRIMESTRE') THEN v_periodicidad_txt := 'T';
    ELSIF v_periodicidad_raw IN ('M','MENSUAL','MES') THEN v_periodicidad_txt := 'M';
    ELSIF v_periodicidad_raw IN ('A','S','T','M') THEN v_periodicidad_txt := v_periodicidad_raw;
    ELSE v_periodicidad_txt := NULL; END IF;
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
  WHERE id = p_request_id;

  PERFORM recalc_puntos_poliza(v_poliza_id);
END;
$$;

-- (Opcional) Intentar dropear el enum viejo si existe y no está en uso.
DO $$
DECLARE
  v_old_name text := 'periodicidad_pago_enum';
  v_dep_count int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
             WHERE t.typname=v_old_name AND n.nspname='public') THEN
    SELECT count(*) INTO v_dep_count
    FROM pg_depend d JOIN pg_type t ON d.refobjid=t.oid
    WHERE t.typname=v_old_name;
    IF v_dep_count = 0 THEN
      EXECUTE 'DROP TYPE public.'||v_old_name;
    END IF;
  END IF;
END $$;
