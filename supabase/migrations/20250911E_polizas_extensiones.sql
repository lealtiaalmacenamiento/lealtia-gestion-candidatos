-- Migration: Extend polizas with user-entered renewal, payment type/day and monthly check flags
-- Date: 2025-09-11
-- Adds:
--   fecha_renovacion (date)
--   tipo_pago (text)
--   dia_pago (smallint)
--   meses_check (jsonb) -> map YYYY-MM:boolean for months 2025-01 .. 2027-12

ALTER TABLE public.polizas ADD COLUMN IF NOT EXISTS fecha_renovacion date;
ALTER TABLE public.polizas ADD COLUMN IF NOT EXISTS tipo_pago text;
ALTER TABLE public.polizas ADD COLUMN IF NOT EXISTS dia_pago smallint CHECK (dia_pago >= 1 AND dia_pago <= 31);
ALTER TABLE public.polizas ADD COLUMN IF NOT EXISTS meses_check jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Optional index to query by renewal date
CREATE INDEX IF NOT EXISTS polizas_fecha_renovacion_idx ON public.polizas(fecha_renovacion);
