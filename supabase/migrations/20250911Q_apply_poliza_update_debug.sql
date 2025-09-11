-- Debug helper for apply_poliza_update  (remove after issue resolved)
-- Date: 2025-09-11
-- Provides detailed JSON about execution or error when approving a poliza update.
-- Usage (RPC): supabase.rpc('apply_poliza_update_dbg', { p_request_id: 'uuid' })

CREATE OR REPLACE FUNCTION public.apply_poliza_update_dbg(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_poliza_id uuid;
  v_payload jsonb;
  v_before polizas%ROWTYPE;
  v_after polizas%ROWTYPE;
  v_err text;
  v_state text;
BEGIN
  -- Capture pending request data first
  SELECT poliza_id, payload_propuesto
    INTO v_poliza_id, v_payload
  FROM poliza_update_requests
  WHERE id = p_request_id AND estado='PENDIENTE';

  IF v_poliza_id IS NOT NULL THEN
    SELECT * INTO v_before FROM polizas WHERE id = v_poliza_id;
  END IF;

  BEGIN
    PERFORM apply_poliza_update(p_request_id);
    IF v_poliza_id IS NOT NULL THEN
      SELECT * INTO v_after FROM polizas WHERE id = v_poliza_id;
    END IF;
    RETURN jsonb_build_object(
      'status','ok',
      'poliza_id', v_poliza_id,
      'payload', v_payload,
      'before', to_jsonb(v_before),
      'after', to_jsonb(v_after)
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_state := SQLSTATE;
    RETURN jsonb_build_object(
      'status','error',
      'sqlstate', v_state,
      'error', v_err,
      'poliza_id', v_poliza_id,
      'payload', v_payload,
      'is_super_role_eval', (SELECT is_super_role()),
      'request_row', (SELECT to_jsonb(r) FROM poliza_update_requests r WHERE r.id = p_request_id)
    );
  END;
END;
$$;

-- Grants (optional)
GRANT EXECUTE ON FUNCTION public.apply_poliza_update_dbg(uuid) TO authenticated, service_role;
