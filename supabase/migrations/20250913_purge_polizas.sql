-- Migration: Purge all records from public.polizas (and dependent caches)
-- Date: 2025-09-13
-- Note: This is destructive. It truncates the table and cascades to dependents.

BEGIN;

-- Remove all policies and any dependent rows (e.g., poliza_puntos_cache)
TRUNCATE TABLE public.polizas CASCADE;

COMMIT;
