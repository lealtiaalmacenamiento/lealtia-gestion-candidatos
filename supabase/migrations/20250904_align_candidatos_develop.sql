-- Align candidatos table in main to match develop
-- Adds missing columns and index in an idempotent way

-- 1) Add missing columns
-- Ejecutar una sola vez; si la columna ya existe ignorar manualmente.
ALTER TABLE candidatos ADD COLUMN fecha_creacion_ct date;
ALTER TABLE candidatos ADD COLUMN proceso text;

-- 2) Add missing index for proceso
create index if not exists candidatos_proceso_idx on candidatos (proceso);

-- Notes:
-- - Foreign keys in main already exist (names differ vs develop, but references are equivalent).
-- - Other indexes/constraints are already present in both branches.
