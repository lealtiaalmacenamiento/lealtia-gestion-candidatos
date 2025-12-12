-- =====================================================
-- Migration: Fix RLS policies search_path references
-- Date: 2024-12-11
-- Description: Ensure all table references in RLS policies
--              use explicit schema qualification
-- =====================================================

-- Drop and recreate prospectos policies with explicit schemas
DROP POLICY IF EXISTS "prospectos_select_authenticated" ON public.prospectos;
DROP POLICY IF EXISTS "prospectos_insert_agente_supervisor_admin" ON public.prospectos;
DROP POLICY IF EXISTS "prospectos_update_creator_admin_supervisor" ON public.prospectos;
DROP POLICY IF EXISTS "prospectos_delete_admin_supervisor" ON public.prospectos;

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
    SELECT 1 FROM public.usuarios u
    WHERE u.id_auth = auth.uid()
    AND u.activo = true
    AND LOWER(u.rol) IN ('agente', 'supervisor', 'admin')
  )
);

-- El agente propietario o admin/supervisor pueden actualizar
CREATE POLICY "prospectos_update_creator_admin_supervisor"
ON public.prospectos
FOR UPDATE TO authenticated
USING (
  prospectos.agente_id IN (
    SELECT u.id FROM public.usuarios u WHERE u.id_auth = auth.uid()
  )
  OR public.is_super_role()
);

-- Admin y supervisor pueden eliminar
CREATE POLICY "prospectos_delete_admin_supervisor"
ON public.prospectos
FOR DELETE TO authenticated
USING (public.is_super_role());

COMMENT ON POLICY "prospectos_insert_agente_supervisor_admin" ON public.prospectos IS 'Permite insertar prospectos a agentes, supervisores y admins activos';
