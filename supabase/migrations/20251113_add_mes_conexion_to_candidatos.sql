-- Add mes_conexion column to candidatos for tracking connection month
ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS mes_conexion text;

COMMENT ON COLUMN public.candidatos.mes_conexion IS 'Mes de conexión del candidato en formato YYYY-MM';

-- Backfill using existing date fields when available so previously captured data is not lost
UPDATE public.candidatos
SET mes_conexion = to_char(fecha_creacion_ct, 'YYYY-MM')
WHERE mes_conexion IS NULL
  AND fecha_creacion_ct IS NOT NULL;

UPDATE public.candidatos
SET mes_conexion = to_char(fecha_creacion_pop, 'YYYY-MM')
WHERE mes_conexion IS NULL
  AND fecha_creacion_pop IS NOT NULL;
