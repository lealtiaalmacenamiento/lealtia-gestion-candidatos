-- Migration: Alter polizas.periodicidad_pago from legacy enum to unified public.periodicidad_pago with view dependency handling
-- Date: 2025-09-11
-- This migration is idempotent-ish: it checks current column type and only alters if still the old enum.
-- Steps:
-- 1. Drop dependent view public.polizas_ui (if it exists) because it references the old enum type.
-- 2. Alter the column to the new enum type.
-- 3. Recreate the view public.polizas_ui.
-- 4. (Optional) Re-grant typical Supabase roles (adjust if your project uses different ones).
-- NOTE: Ensure previous migration that creates type public.periodicidad_pago has run.

CREATE OR REPLACE FUNCTION _tmp_alter_polizas_periodicidad_pago() RETURNS void AS $$
DECLARE
  v_col_type text;
  v_has_view boolean;
BEGIN
  SELECT at.typname
    INTO v_col_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid AND c.relname='polizas'
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname='public'
  JOIN pg_type at ON at.oid = a.atttypid
  WHERE a.attname='periodicidad_pago';

  SELECT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='polizas_ui') INTO v_has_view;

  IF v_has_view THEN
    EXECUTE 'DROP VIEW public.polizas_ui';
  END IF;

  IF v_col_type <> 'periodicidad_pago' THEN
    EXECUTE 'ALTER TABLE public.polizas ALTER COLUMN periodicidad_pago TYPE public.periodicidad_pago USING periodicidad_pago::text::public.periodicidad_pago';
  END IF;
END; $$ LANGUAGE plpgsql;

SELECT _tmp_alter_polizas_periodicidad_pago();
DROP FUNCTION _tmp_alter_polizas_periodicidad_pago();

-- Recreate the view (simple projection of polizas). Adjust if original definition had filters/joins.
CREATE OR REPLACE VIEW public.polizas_ui AS
SELECT 
  p.id,
  p.cliente_id,
  p.numero_poliza,
  p.estatus,
  p.forma_pago,
  p.periodicidad_pago,
  p.prima_input,
  p.prima_moneda,
  p.sa_input,
  p.sa_moneda,
  p.fecha_emision,
  p.fecha_renovacion,
  p.tipo_pago,
  p.dia_pago,
  p.meses_check,
  p.producto_parametro_id,
  p.fecha_alta_sistema
FROM public.polizas p;

-- Typical Supabase grants (adjust if needed)
DO $$
BEGIN
  BEGIN EXECUTE 'GRANT SELECT ON public.polizas_ui TO anon'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'GRANT SELECT ON public.polizas_ui TO authenticated'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'GRANT SELECT ON public.polizas_ui TO service_role'; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- (Optional) Old enum drop should happen in a later migration once no objects depend on it.
