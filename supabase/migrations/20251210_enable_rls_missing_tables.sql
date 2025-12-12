-- Migration: Enable RLS on missing tables
-- Date: 2025-12-10
-- Description: Enable Row Level Security on public tables that are missing it

-- =======================
-- 1. ENABLE RLS
-- =======================

-- campaigns_custom_metrics
ALTER TABLE public.campaigns_custom_metrics ENABLE ROW LEVEL SECURITY;

-- usuarios
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- tokens_integracion
ALTER TABLE public.tokens_integracion ENABLE ROW LEVEL SECURITY;

-- agente_meta
ALTER TABLE public.agente_meta ENABLE ROW LEVEL SECURITY;

-- prospectos
ALTER TABLE public.prospectos ENABLE ROW LEVEL SECURITY;

-- logs_integracion
ALTER TABLE public.logs_integracion ENABLE ROW LEVEL SECURITY;


-- =======================
-- 2. RLS POLICIES
-- =======================

-- ============================================
-- CAMPAIGNS_CUSTOM_METRICS
-- ============================================
-- Todos pueden leer métricas custom
CREATE POLICY "campaigns_custom_metrics_select_all"
ON public.campaigns_custom_metrics
FOR SELECT
USING (true);

-- Solo admin y supervisor pueden insertar
CREATE POLICY "campaigns_custom_metrics_insert_admin_supervisor"
ON public.campaigns_custom_metrics
FOR INSERT TO authenticated
WITH CHECK (public.is_super_role());

-- Solo admin y supervisor pueden actualizar
CREATE POLICY "campaigns_custom_metrics_update_admin_supervisor"
ON public.campaigns_custom_metrics
FOR UPDATE TO authenticated
USING (public.is_super_role())
WITH CHECK (public.is_super_role());

-- Solo admin puede eliminar
CREATE POLICY "campaigns_custom_metrics_delete_admin_supervisor"
ON public.campaigns_custom_metrics
FOR DELETE TO authenticated
USING (public.is_super_role());


-- ============================================
-- USUARIOS
-- ============================================
-- Todos los usuarios autenticados pueden ver usuarios
CREATE POLICY "usuarios_select_authenticated"
ON public.usuarios
FOR SELECT TO authenticated
USING (true);

-- Solo admin y supervisor pueden insertar usuarios
CREATE POLICY "usuarios_insert_admin_supervisor"
ON public.usuarios
FOR INSERT TO authenticated
WITH CHECK (public.is_super_role());

-- Admin y supervisor pueden actualizar, o el propio usuario puede actualizar su perfil
CREATE POLICY "usuarios_update_admin_supervisor_self"
ON public.usuarios
FOR UPDATE TO authenticated
USING (
  usuarios.id_auth = auth.uid()
  OR public.is_super_role()
);

-- Solo admin y supervisor pueden eliminar usuarios (no admin/supervisor)
CREATE POLICY "usuarios_delete_admin_supervisor"
ON public.usuarios
FOR DELETE TO authenticated
USING (
  public.is_super_role()
  AND LOWER(usuarios.rol) NOT IN ('admin', 'supervisor')
);


-- ============================================
-- TOKENS_INTEGRACION
-- ============================================
-- Los usuarios solo pueden ver sus propios tokens o admin/supervisor pueden ver todos
CREATE POLICY "tokens_integracion_select_own"
ON public.tokens_integracion
FOR SELECT TO authenticated
USING (
  tokens_integracion.usuario_id = auth.uid()
  OR public.is_super_role()
);

-- Los usuarios pueden insertar sus propios tokens
CREATE POLICY "tokens_integracion_insert_own"
ON public.tokens_integracion
FOR INSERT TO authenticated
WITH CHECK (tokens_integracion.usuario_id = auth.uid());

-- Los usuarios pueden actualizar sus propios tokens
CREATE POLICY "tokens_integracion_update_own"
ON public.tokens_integracion
FOR UPDATE TO authenticated
USING (tokens_integracion.usuario_id = auth.uid());

-- Los usuarios pueden eliminar sus propios tokens
CREATE POLICY "tokens_integracion_delete_own"
ON public.tokens_integracion
FOR DELETE TO authenticated
USING (tokens_integracion.usuario_id = auth.uid());


-- ============================================
-- AGENTE_META
-- ============================================
-- Todos los usuarios autenticados pueden leer agente_meta
CREATE POLICY "agente_meta_select_authenticated"
ON public.agente_meta
FOR SELECT TO authenticated
USING (true);

-- Admin y supervisor pueden insertar
CREATE POLICY "agente_meta_insert_admin_supervisor"
ON public.agente_meta
FOR INSERT TO authenticated
WITH CHECK (public.is_super_role());

-- Admin, supervisor y el propio agente pueden actualizar
CREATE POLICY "agente_meta_update_admin_supervisor_self"
ON public.agente_meta
FOR UPDATE TO authenticated
USING (
  agente_meta.usuario_id IN (
    SELECT id FROM public.usuarios WHERE id_auth = auth.uid()
  )
  OR public.is_super_role()
);

-- Solo admin y supervisor pueden eliminar
CREATE POLICY "agente_meta_delete_admin_supervisor"
ON public.agente_meta
FOR DELETE TO authenticated
USING (public.is_super_role());


-- ============================================
-- PROSPECTOS
-- ============================================
-- Todos los usuarios autenticados pueden ver prospectos
CREATE POLICY "prospectos_select_authenticated"
ON public.prospectos
FOR SELECT TO authenticated
USING (true);

-- Agente, supervisor y admin pueden insertar prospectos
CREATE POLICY "prospectos_insert_agente_supervisor_admin"
ON public.prospectos
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE usuarios.id_auth = auth.uid()
    AND usuarios.activo = true
    AND LOWER(usuarios.rol) IN ('agente', 'supervisor', 'admin')
  )
);

-- El agente propietario o admin/supervisor pueden actualizar
CREATE POLICY "prospectos_update_creator_admin_supervisor"
ON public.prospectos
FOR UPDATE TO authenticated
USING (
  prospectos.agente_id IN (
    SELECT id FROM public.usuarios WHERE id_auth = auth.uid()
  )
  OR public.is_super_role()
);

-- Admin y supervisor pueden eliminar
CREATE POLICY "prospectos_delete_admin_supervisor"
ON public.prospectos
FOR DELETE TO authenticated
USING (public.is_super_role());


-- ============================================
-- LOGS_INTEGRACION
-- ============================================
-- Admin y supervisor pueden ver todos los logs, otros solo los propios
CREATE POLICY "logs_integracion_select_own_or_admin"
ON public.logs_integracion
FOR SELECT TO authenticated
USING (
  logs_integracion.usuario_id = auth.uid()
  OR public.is_super_role()
);

-- Los usuarios pueden insertar sus propios logs
CREATE POLICY "logs_integracion_insert_own"
ON public.logs_integracion
FOR INSERT TO authenticated
WITH CHECK (logs_integracion.usuario_id = auth.uid());

-- Solo admin y supervisor pueden actualizar logs
CREATE POLICY "logs_integracion_update_admin_supervisor"
ON public.logs_integracion
FOR UPDATE TO authenticated
USING (public.is_super_role());

-- Solo admin y supervisor pueden eliminar logs
CREATE POLICY "logs_integracion_delete_admin_supervisor"
ON public.logs_integracion
FOR DELETE TO authenticated
USING (public.is_super_role());


-- =======================
-- 3. PERFORMANCE INDEXES
-- =======================

-- Índices para campaigns_custom_metrics
-- (ya existen en 20251117_create_campaigns_custom_metrics.sql, no duplicamos)

-- Índices para usuarios
CREATE INDEX IF NOT EXISTS idx_usuarios_id_auth 
ON public.usuarios(id_auth);

CREATE INDEX IF NOT EXISTS idx_usuarios_email 
ON public.usuarios(LOWER(email));

CREATE INDEX IF NOT EXISTS idx_usuarios_rol_activo 
ON public.usuarios(LOWER(rol), activo);

-- Índices para tokens_integracion
CREATE INDEX IF NOT EXISTS idx_tokens_integracion_usuario_id 
ON public.tokens_integracion(usuario_id);

CREATE INDEX IF NOT EXISTS idx_tokens_integracion_proveedor 
ON public.tokens_integracion(proveedor);

CREATE INDEX IF NOT EXISTS idx_tokens_integracion_usuario_proveedor 
ON public.tokens_integracion(usuario_id, proveedor);

-- Índices para agente_meta
CREATE INDEX IF NOT EXISTS idx_agente_meta_usuario_id 
ON public.agente_meta(usuario_id);

-- Índices para prospectos
-- (agente_id, anio, semana_iso) y (estado) ya existen en 20250827_fase2_prospectos_planificacion.sql

-- Índices para logs_integracion
CREATE INDEX IF NOT EXISTS idx_logs_integracion_usuario_id 
ON public.logs_integracion(usuario_id);

CREATE INDEX IF NOT EXISTS idx_logs_integracion_proveedor 
ON public.logs_integracion(proveedor);

-- (created_at DESC) ya existe como logs_integracion_created_idx

CREATE INDEX IF NOT EXISTS idx_logs_integracion_usuario_proveedor_date 
ON public.logs_integracion(usuario_id, proveedor, created_at DESC);


-- =======================
-- COMENTARIOS
-- =======================

COMMENT ON POLICY "campaigns_custom_metrics_select_all" 
ON public.campaigns_custom_metrics IS 'Todos pueden leer métricas custom de campañas';

COMMENT ON POLICY "usuarios_select_authenticated" 
ON public.usuarios IS 'Usuarios autenticados pueden ver la lista de usuarios';

COMMENT ON POLICY "tokens_integracion_select_own" 
ON public.tokens_integracion IS 'Los usuarios solo pueden ver sus propios tokens o admin/supervisor pueden ver todos';

COMMENT ON POLICY "agente_meta_select_authenticated" 
ON public.agente_meta IS 'Todos los usuarios autenticados pueden leer metadatos de agentes';

COMMENT ON POLICY "prospectos_select_authenticated" 
ON public.prospectos IS 'Todos los usuarios autenticados pueden ver prospectos';

COMMENT ON POLICY "logs_integracion_select_own_or_admin" 
ON public.logs_integracion IS 'Los usuarios pueden ver sus propios logs, admin/supervisor pueden ver todos';
