-- Migración: ampliar fecha_cita (prospectos) a timestamp con hora
-- Permite agendar cita con fecha y hora (antes solo date)
ALTER TABLE prospectos
  ALTER COLUMN fecha_cita TYPE timestamptz USING fecha_cita::timestamptz;

-- Nota: el nombre de la columna se mantiene (fecha_cita) para no romper código existente.