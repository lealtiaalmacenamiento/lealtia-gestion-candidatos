-- Migration: add POP related fields to candidatos
-- Adds textual POP identifier and fecha_creacion_pop date field.
-- Safe to run multiple times (IF NOT EXISTS guards where possible).

-- Simple add (ejecutar una sola vez); si la columna existe fallará y deberás borrar esta migración.
ALTER TABLE public.candidatos ADD COLUMN pop text;
ALTER TABLE public.candidatos ADD COLUMN fecha_creacion_pop date;

-- Optional: comment for documentation
COMMENT ON COLUMN public.candidatos.pop IS 'Identificador POP del candidato';
COMMENT ON COLUMN public.candidatos.fecha_creacion_pop IS 'Fecha de creación del POP (aaaa-mm-dd)';
