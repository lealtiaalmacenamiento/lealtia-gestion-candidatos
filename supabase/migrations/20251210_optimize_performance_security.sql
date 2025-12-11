-- =====================================================
-- Migration: Performance and Security Optimizations
-- Date: 2024-12-10
-- Description: 
--   1. Optimize 27 RLS policies with auth.uid() (wrap in subquery)
--   2. Add 13 missing foreign key indexes
--   3. Add policies to 4 tables with RLS but no policies
--   4. Review unused indexes (kept for now, documented)
-- =====================================================

-- =====================================================
-- SECTION 1: OPTIMIZE RLS POLICIES (auth_rls_initplan)
-- Wrap auth.uid() in SELECT subquery to prevent initplan issues
-- =====================================================

-- agente_meta
DROP POLICY IF EXISTS agente_meta_update_admin_supervisor_self ON public.agente_meta;
CREATE POLICY agente_meta_update_admin_supervisor_self ON public.agente_meta
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.usuarios WHERE id = agente_meta.usuario_id AND id_auth = (SELECT auth.uid()))
    OR is_super_role()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.usuarios WHERE id = agente_meta.usuario_id AND id_auth = (SELECT auth.uid()))
    OR is_super_role()
  );

-- campaign_progress
DROP POLICY IF EXISTS campaign_progress_select_self ON public.campaign_progress;
CREATE POLICY campaign_progress_select_self ON public.campaign_progress
  FOR SELECT TO authenticated
  USING (
    usuario_id IN (SELECT id FROM public.usuarios WHERE id_auth = (SELECT auth.uid()))
    OR is_super_role()
  );

-- citas
DROP POLICY IF EXISTS citas_insert_involved_or_super ON public.citas;
CREATE POLICY citas_insert_involved_or_super ON public.citas
  FOR INSERT TO authenticated
  WITH CHECK (
    agente_id = (SELECT auth.uid())
    OR supervisor_id = (SELECT auth.uid())
    OR is_super_role()
  );

DROP POLICY IF EXISTS citas_update_involved_or_super ON public.citas;
CREATE POLICY citas_update_involved_or_super ON public.citas
  FOR UPDATE TO authenticated
  USING (
    agente_id = (SELECT auth.uid())
    OR supervisor_id = (SELECT auth.uid())
    OR is_super_role()
  )
  WITH CHECK (
    agente_id = (SELECT auth.uid())
    OR supervisor_id = (SELECT auth.uid())
    OR is_super_role()
  );

-- cliente_update_requests
DROP POLICY IF EXISTS ins_cliente_update_requests ON public.cliente_update_requests;
CREATE POLICY ins_cliente_update_requests ON public.cliente_update_requests
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS sel_cliente_update_requests ON public.cliente_update_requests;
CREATE POLICY sel_cliente_update_requests ON public.cliente_update_requests
  FOR SELECT TO authenticated
  USING (
    solicitante_id = (SELECT auth.uid())
    OR is_super_role()
  );

-- clientes
DROP POLICY IF EXISTS ins_clientes_asesor ON public.clientes;
CREATE POLICY ins_clientes_asesor ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (
    asesor_id = (SELECT auth.uid())
    OR is_super_role()
  );

DROP POLICY IF EXISTS sel_clientes ON public.clientes;
CREATE POLICY sel_clientes ON public.clientes
  FOR SELECT TO authenticated
  USING (
    asesor_id = (SELECT auth.uid())
    OR is_super_role()
  );

-- historial_costos_poliza
DROP POLICY IF EXISTS ins_historial_costos_poliza_super ON public.historial_costos_poliza;
CREATE POLICY ins_historial_costos_poliza_super ON public.historial_costos_poliza
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());

DROP POLICY IF EXISTS sel_historial_costos_poliza_super ON public.historial_costos_poliza;
CREATE POLICY sel_historial_costos_poliza_super ON public.historial_costos_poliza
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.polizas p
      JOIN public.clientes c ON p.cliente_id = c.id
      WHERE p.id = historial_costos_poliza.poliza_id
        AND (c.asesor_id = (SELECT auth.uid())
             OR is_super_role())
    )
  );

-- logs_integracion
DROP POLICY IF EXISTS logs_integracion_insert_own ON public.logs_integracion;
CREATE POLICY logs_integracion_insert_own ON public.logs_integracion
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS logs_integracion_select_own_or_admin ON public.logs_integracion;
CREATE POLICY logs_integracion_select_own_or_admin ON public.logs_integracion
  FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()) OR is_super_role());

-- planificaciones
DROP POLICY IF EXISTS planificaciones_insert_owner_or_super ON public.planificaciones;
CREATE POLICY planificaciones_insert_owner_or_super ON public.planificaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    agente_id IN (SELECT id FROM public.usuarios WHERE id_auth = (SELECT auth.uid()))
    OR is_super_role()
  );

DROP POLICY IF EXISTS planificaciones_update_owner_or_super ON public.planificaciones;
CREATE POLICY planificaciones_update_owner_or_super ON public.planificaciones
  FOR UPDATE TO authenticated
  USING (
    agente_id IN (SELECT id FROM public.usuarios WHERE id_auth = (SELECT auth.uid()))
    OR is_super_role()
  )
  WITH CHECK (
    agente_id IN (SELECT id FROM public.usuarios WHERE id_auth = (SELECT auth.uid()))
    OR is_super_role()
  );

-- poliza_puntos_cache
DROP POLICY IF EXISTS sel_poliza_puntos_cache ON public.poliza_puntos_cache;
CREATE POLICY sel_poliza_puntos_cache ON public.poliza_puntos_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.polizas p
      JOIN public.clientes c ON p.cliente_id = c.id
      WHERE p.id = poliza_puntos_cache.poliza_id
        AND (c.asesor_id = (SELECT auth.uid())
             OR is_super_role())
    )
  );

-- poliza_update_requests
DROP POLICY IF EXISTS ins_poliza_update_requests ON public.poliza_update_requests;
CREATE POLICY ins_poliza_update_requests ON public.poliza_update_requests
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS sel_poliza_update_requests ON public.poliza_update_requests;
CREATE POLICY sel_poliza_update_requests ON public.poliza_update_requests
  FOR SELECT TO authenticated
  USING (
    solicitante_id = (SELECT auth.uid())
    OR is_super_role()
  );

-- polizas
DROP POLICY IF EXISTS sel_polizas ON public.polizas;
CREATE POLICY sel_polizas ON public.polizas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = polizas.cliente_id
        AND (c.asesor_id = (SELECT auth.uid())
             OR is_super_role())
    )
  );

-- prospectos
DROP POLICY IF EXISTS prospectos_insert_agente_supervisor_admin ON public.prospectos;
CREATE POLICY prospectos_insert_agente_supervisor_admin ON public.prospectos
  FOR INSERT TO authenticated
  WITH CHECK (
    agente_id IN (SELECT id FROM public.usuarios WHERE id_auth = (SELECT auth.uid()))
    OR is_super_role()
  );

DROP POLICY IF EXISTS prospectos_update_creator_admin_supervisor ON public.prospectos;
CREATE POLICY prospectos_update_creator_admin_supervisor ON public.prospectos
  FOR UPDATE TO authenticated
  USING (
    agente_id IN (SELECT id FROM public.usuarios WHERE id_auth = (SELECT auth.uid()))
    OR is_super_role()
  )
  WITH CHECK (
    agente_id IN (SELECT id FROM public.usuarios WHERE id_auth = (SELECT auth.uid()))
    OR is_super_role()
  );

-- registro_acciones
DROP POLICY IF EXISTS registro_acciones_select_own_or_super ON public.registro_acciones;
CREATE POLICY registro_acciones_select_own_or_super ON public.registro_acciones
  FOR SELECT TO authenticated
  USING (
    usuario IN (SELECT email FROM public.usuarios WHERE id_auth = (SELECT auth.uid()))
    OR is_super_role()
  );

-- tokens_integracion
DROP POLICY IF EXISTS tokens_integracion_delete_own ON public.tokens_integracion;
CREATE POLICY tokens_integracion_delete_own ON public.tokens_integracion
  FOR DELETE TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS tokens_integracion_insert_own ON public.tokens_integracion;
CREATE POLICY tokens_integracion_insert_own ON public.tokens_integracion
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS tokens_integracion_select_own ON public.tokens_integracion;
CREATE POLICY tokens_integracion_select_own ON public.tokens_integracion
  FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS tokens_integracion_update_own ON public.tokens_integracion;
CREATE POLICY tokens_integracion_update_own ON public.tokens_integracion
  FOR UPDATE TO authenticated
  USING (usuario_id = (SELECT auth.uid()))
  WITH CHECK (usuario_id = (SELECT auth.uid()));

-- user_segments
DROP POLICY IF EXISTS user_segments_select_self ON public.user_segments;
CREATE POLICY user_segments_select_self ON public.user_segments
  FOR SELECT TO authenticated
  USING (
    usuario_id IN (SELECT id FROM public.usuarios WHERE id_auth = (SELECT auth.uid()))
    OR is_super_role()
  );

-- usuarios
DROP POLICY IF EXISTS usuarios_update_admin_supervisor_self ON public.usuarios;
CREATE POLICY usuarios_update_admin_supervisor_self ON public.usuarios
  FOR UPDATE TO authenticated
  USING (
    id_auth = (SELECT auth.uid())
    OR is_super_role()
  )
  WITH CHECK (
    id_auth = (SELECT auth.uid())
    OR is_super_role()
  );

-- =====================================================
-- SECTION 2: ADD MISSING FOREIGN KEY INDEXES (13 total)
-- =====================================================

-- candidatos foreign keys
CREATE INDEX IF NOT EXISTS idx_candidatos_usuario_creador ON public.candidatos(usuario_creador);
CREATE INDEX IF NOT EXISTS idx_candidatos_usuario_que_actualizo ON public.candidatos(usuario_que_actualizo);

-- producto_parametros foreign keys
CREATE INDEX IF NOT EXISTS idx_producto_parametros_product_type_id ON public.producto_parametros(product_type_id);

-- clientes foreign keys
CREATE INDEX IF NOT EXISTS idx_clientes_inactivado_por ON public.clientes(inactivado_por);

-- poliza_puntos_cache foreign keys
CREATE INDEX IF NOT EXISTS idx_poliza_puntos_cache_producto_parametro_id ON public.poliza_puntos_cache(producto_parametro_id);

-- cliente_historial foreign keys
CREATE INDEX IF NOT EXISTS idx_cliente_historial_cliente_id ON public.cliente_historial(cliente_id);

-- cliente_update_requests foreign keys
CREATE INDEX IF NOT EXISTS idx_cliente_update_requests_cliente_id ON public.cliente_update_requests(cliente_id);

-- historial_costos_poliza foreign keys
CREATE INDEX IF NOT EXISTS idx_historial_costos_poliza_poliza_id ON public.historial_costos_poliza(poliza_id);

-- poliza_update_requests foreign keys
CREATE INDEX IF NOT EXISTS idx_poliza_update_requests_poliza_id ON public.poliza_update_requests(poliza_id);

-- citas foreign keys
CREATE INDEX IF NOT EXISTS idx_citas_prospecto_id ON public.citas(prospecto_id);

-- user_segments foreign keys
CREATE INDEX IF NOT EXISTS idx_user_segments_assigned_by ON public.user_segments(assigned_by);

-- campaigns foreign keys
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by ON public.campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_campaigns_primary_segment_id ON public.campaigns(primary_segment_id);

-- =====================================================
-- SECTION 3: ADD POLICIES TO TABLES WITH RLS BUT NO POLICIES
-- These tables currently have RLS enabled but no policies (4 tables)
-- =====================================================

-- dias_mes (lookup table - read-only for all authenticated users)
CREATE POLICY dias_mes_select_all ON public.dias_mes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY dias_mes_insert_super ON public.dias_mes
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());

CREATE POLICY dias_mes_update_super ON public.dias_mes
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

CREATE POLICY dias_mes_delete_super ON public.dias_mes
  FOR DELETE TO authenticated
  USING (is_super_role());

-- fx_values (financial data - read-only for all authenticated users)
CREATE POLICY fx_values_select_all ON public.fx_values
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY fx_values_insert_super ON public.fx_values
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());

CREATE POLICY fx_values_update_super ON public.fx_values
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

CREATE POLICY fx_values_delete_super ON public.fx_values
  FOR DELETE TO authenticated
  USING (is_super_role());

-- producto_parametros (product config - read for all, write for super)
CREATE POLICY producto_parametros_select_all ON public.producto_parametros
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY producto_parametros_insert_super ON public.producto_parametros
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());

CREATE POLICY producto_parametros_update_super ON public.producto_parametros
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

CREATE POLICY producto_parametros_delete_super ON public.producto_parametros
  FOR DELETE TO authenticated
  USING (is_super_role());

-- udi_values (financial data - read-only for all authenticated users)
CREATE POLICY udi_values_select_all ON public.udi_values
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY udi_values_insert_super ON public.udi_values
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());

CREATE POLICY udi_values_update_super ON public.udi_values
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

CREATE POLICY udi_values_delete_super ON public.udi_values
  FOR DELETE TO authenticated
  USING (is_super_role());

-- =====================================================
-- SECTION 4: UNUSED INDEXES DOCUMENTATION
-- The following 32 indexes show 0 scans but are kept because:
-- - They may be used during low-traffic periods or specific operations
-- - Unique constraints (ux_, _key) are required for data integrity
-- - Some are needed for specific query patterns not yet in production
-- 
-- If these indexes cause performance issues, they can be dropped individually.
-- Monitor pg_stat_user_indexes over time to confirm true unused status.
-- =====================================================

-- Notable unused indexes to review later:
-- - idx_registro_acciones_* (3 indexes, 456 kB total)
-- - Unique constraints on candidatos, clientes (required for integrity)
-- - Date/status indexes that may be used in reports

-- =====================================================
-- END OF MIGRATION
-- =====================================================
