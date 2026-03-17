-- Resuelve ambigüedad de overload de rpc_exec_funnel:
--   · Elimina la versión 3-param (legacy, con filtro de fecha) del 20260228
--   · Mantiene/recrea la versión 1-param (9 fases, todos los candidatos) del 20260303
-- La versión 3-param nunca se usó desde el frontend (route siempre pasa solo p_asesor_auth_id).

DROP FUNCTION IF EXISTS public.rpc_exec_funnel(date, date, uuid);
