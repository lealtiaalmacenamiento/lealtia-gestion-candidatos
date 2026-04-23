-- Migration: Módulo Fondos para Zoom
-- Fecha: 2026-04-20

-- 1. Foto de perfil en usuarios
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS foto_perfil_url text;

-- 2. Tabla para los fondos de Zoom gestionados por supervisores/admin
CREATE TABLE IF NOT EXISTS zoom_fondos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  public_url   text NOT NULL,
  uploaded_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 3. RLS
ALTER TABLE zoom_fondos ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado puede ver los fondos activos
CREATE POLICY "zoom_fondos_select"
  ON zoom_fondos FOR SELECT
  TO authenticated
  USING (activo = true);

-- Escritura: solo supervisores y admins
CREATE POLICY "zoom_fondos_insert"
  ON zoom_fondos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id_auth = auth.uid()
        AND u.rol IN ('supervisor', 'admin')
        AND u.activo = true
    )
  );

CREATE POLICY "zoom_fondos_update"
  ON zoom_fondos FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id_auth = auth.uid()
        AND u.rol IN ('supervisor', 'admin')
        AND u.activo = true
    )
  );

CREATE POLICY "zoom_fondos_delete"
  ON zoom_fondos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id_auth = auth.uid()
        AND u.rol IN ('supervisor', 'admin')
        AND u.activo = true
    )
  );

-- 4. Índice para consultas comunes
CREATE INDEX IF NOT EXISTS zoom_fondos_activo_created_idx
  ON zoom_fondos (activo, created_at DESC);

-- 5. Instrucciones para Supabase Storage (ejecutar manualmente en el dashboard si no existe acceso programático):
-- Bucket 'zoom-fondos': público, max 10MB, solo image/*
--   Storage policy INSERT: rol IN ('supervisor','admin')
--   Storage policy SELECT/DELETE: rol IN ('supervisor','admin') para DELETE, SELECT público
-- Bucket 'fotos-perfil': público, max 5MB, solo image/*
--   Storage policy INSERT/UPDATE/DELETE: solo el propio usuario en su carpeta {userId}/
