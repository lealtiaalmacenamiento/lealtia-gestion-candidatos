-- Agrega columna email_agente a candidatos
-- Ejecutar una sola vez; si la columna ya existe ignorar manualmente.
ALTER TABLE candidatos ADD COLUMN email_agente text;
create index if not exists idx_candidatos_email_agente on candidatos(email_agente);
