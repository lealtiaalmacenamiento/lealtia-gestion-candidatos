-- Fix remaining security issues from Supabase linter
-- 11 ERROR issues: 6 SECURITY DEFINER views + 5 tables without RLS

-- ============================================
-- 1. ENABLE RLS ON REMAINING TABLES
-- ============================================

ALTER TABLE public.registro_acciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Parametros" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospectos_historial ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 2. CREATE RLS POLICIES
-- ============================================

-- REGISTRO_ACCIONES
-- Admin y supervisor pueden ver todos, usuarios normales solo los propios
CREATE POLICY "registro_acciones_select_own_or_super"
ON public.registro_acciones
FOR SELECT TO authenticated
USING (
  registro_acciones.usuario IN (
    SELECT email FROM public.usuarios WHERE id_auth = (SELECT auth.uid())
  )
  OR public.is_super_role()
);

-- Solo admin y supervisor pueden insertar registros de acciones
CREATE POLICY "registro_acciones_insert_super"
ON public.registro_acciones
FOR INSERT TO authenticated
WITH CHECK (public.is_super_role());

-- Solo admin y supervisor pueden actualizar
CREATE POLICY "registro_acciones_update_super"
ON public.registro_acciones
FOR UPDATE TO authenticated
USING (public.is_super_role());

-- Solo admin y supervisor pueden eliminar
CREATE POLICY "registro_acciones_delete_super"
ON public.registro_acciones
FOR DELETE TO authenticated
USING (public.is_super_role());


-- PLANIFICACIONES
-- Todos pueden leer planificaciones
CREATE POLICY "planificaciones_select_all"
ON public.planificaciones
FOR SELECT TO authenticated
USING (true);

-- El agente propietario o admin/supervisor pueden insertar
CREATE POLICY "planificaciones_insert_owner_or_super"
ON public.planificaciones
FOR INSERT TO authenticated
WITH CHECK (
  planificaciones.agente_id IN (
    SELECT id FROM public.usuarios WHERE id_auth = (SELECT auth.uid())
  )
  OR public.is_super_role()
);

-- El agente propietario o admin/supervisor pueden actualizar
CREATE POLICY "planificaciones_update_owner_or_super"
ON public.planificaciones
FOR UPDATE TO authenticated
USING (
  planificaciones.agente_id IN (
    SELECT id FROM public.usuarios WHERE id_auth = (SELECT auth.uid())
  )
  OR public.is_super_role()
);

-- Solo admin y supervisor pueden eliminar
CREATE POLICY "planificaciones_delete_super"
ON public.planificaciones
FOR DELETE TO authenticated
USING (public.is_super_role());


-- CITAS
-- Todos pueden ver todas las citas
CREATE POLICY "citas_select_all"
ON public.citas
FOR SELECT TO authenticated
USING (true);

-- El agente o supervisor de la cita, o admin/supervisor pueden insertar
CREATE POLICY "citas_insert_involved_or_super"
ON public.citas
FOR INSERT TO authenticated
WITH CHECK (
  citas.agente_id = (SELECT auth.uid())
  OR citas.supervisor_id = (SELECT auth.uid())
  OR public.is_super_role()
);

-- El agente o supervisor de la cita, o admin/supervisor pueden actualizar
CREATE POLICY "citas_update_involved_or_super"
ON public.citas
FOR UPDATE TO authenticated
USING (
  citas.agente_id = (SELECT auth.uid())
  OR citas.supervisor_id = (SELECT auth.uid())
  OR public.is_super_role()
);

-- Solo admin y supervisor pueden eliminar
CREATE POLICY "citas_delete_super"
ON public.citas
FOR DELETE TO authenticated
USING (public.is_super_role());


-- PARAMETROS (tabla de configuración)
-- Todos pueden leer parámetros
CREATE POLICY "parametros_select_all"
ON public."Parametros"
FOR SELECT TO authenticated
USING (true);

-- Solo admin y supervisor pueden modificar
CREATE POLICY "parametros_insert_super"
ON public."Parametros"
FOR INSERT TO authenticated
WITH CHECK (public.is_super_role());

CREATE POLICY "parametros_update_super"
ON public."Parametros"
FOR UPDATE TO authenticated
USING (public.is_super_role());

CREATE POLICY "parametros_delete_super"
ON public."Parametros"
FOR DELETE TO authenticated
USING (public.is_super_role());


-- PROSPECTOS_HISTORIAL
-- Todos pueden leer el historial
CREATE POLICY "prospectos_historial_select_all"
ON public.prospectos_historial
FOR SELECT TO authenticated
USING (true);

-- Solo el sistema puede insertar (triggers), admin/supervisor también
CREATE POLICY "prospectos_historial_insert_super"
ON public.prospectos_historial
FOR INSERT TO authenticated
WITH CHECK (public.is_super_role());

-- Solo admin y supervisor pueden actualizar
CREATE POLICY "prospectos_historial_update_super"
ON public.prospectos_historial
FOR UPDATE TO authenticated
USING (public.is_super_role());

-- Solo admin y supervisor pueden eliminar
CREATE POLICY "prospectos_historial_delete_super"
ON public.prospectos_historial
FOR DELETE TO authenticated
USING (public.is_super_role());


-- ============================================
-- 3. FIX SECURITY DEFINER VIEWS
-- ============================================
-- Convert SECURITY DEFINER views to SECURITY INVOKER
-- This makes them use the permissions of the calling user instead of the view creator

ALTER VIEW public.polizas_ui SET (security_invoker = true);
ALTER VIEW public.polizas_valores_actuales SET (security_invoker = true);
ALTER VIEW public.campaign_progress_summary SET (security_invoker = true);
ALTER VIEW public.vw_polizas_metricas SET (security_invoker = true);
ALTER VIEW public.vw_rc_metricas SET (security_invoker = true);
ALTER VIEW public.citas_ocupadas SET (security_invoker = true);


-- ============================================
-- 4. PERFORMANCE INDEXES
-- ============================================

-- Índices para registro_acciones
CREATE INDEX IF NOT EXISTS idx_registro_acciones_usuario 
ON public.registro_acciones(usuario);

CREATE INDEX IF NOT EXISTS idx_registro_acciones_fecha 
ON public.registro_acciones(fecha DESC);

CREATE INDEX IF NOT EXISTS idx_registro_acciones_tabla 
ON public.registro_acciones(tabla_afectada);

-- Índices para planificaciones (ya existen, verificar)
-- idx_planif_agente_semana ya existe

-- Índices para citas (algunos ya existen)
-- citas_agente_inicio_idx ya existe
-- citas_supervisor_inicio_idx ya existe

CREATE INDEX IF NOT EXISTS idx_citas_estado 
ON public.citas(estado);

-- Índices para Parametros
CREATE INDEX IF NOT EXISTS idx_parametros_tipo_clave 
ON public."Parametros"(tipo, clave);


-- ============================================
-- COMENTARIOS
-- ============================================

COMMENT ON POLICY "registro_acciones_select_own_or_super" 
ON public.registro_acciones IS 'Los usuarios pueden ver sus propios registros, admin/supervisor ven todos';

COMMENT ON POLICY "planificaciones_select_all" 
ON public.planificaciones IS 'Todos los usuarios autenticados pueden ver planificaciones';

COMMENT ON POLICY "citas_select_all" 
ON public.citas IS 'Todos los usuarios autenticados pueden ver citas';

COMMENT ON POLICY "parametros_select_all" 
ON public."Parametros" IS 'Todos pueden leer parámetros de configuración';

COMMENT ON POLICY "prospectos_historial_select_all" 
ON public.prospectos_historial IS 'Todos pueden leer el historial de prospectos';
