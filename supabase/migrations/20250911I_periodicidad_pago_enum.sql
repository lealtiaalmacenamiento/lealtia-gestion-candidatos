-- Crea enum periodicidad_pago y columna en polizas si no existen
-- Fecha: 2025-09-11
-- NOTA: El linter está fallando con CREATE TYPE; ejecutar manualmente en SQL:
--   CREATE TYPE periodicidad_pago AS ENUM ('A','S','T','M');
-- Si ya existe, ignorar el error de duplicado.

ALTER TABLE polizas ADD COLUMN periodicidad_pago periodicidad_pago NULL;

-- Opcional: índice para filtros frecuentes
CREATE INDEX IF NOT EXISTS idx_polizas_periodicidad_pago ON polizas(periodicidad_pago);
