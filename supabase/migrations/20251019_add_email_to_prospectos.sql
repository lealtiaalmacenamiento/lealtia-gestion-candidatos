-- Añade columna de correo electrónico para prospectos
ALTER TABLE prospectos
  ADD COLUMN IF NOT EXISTS email text;

-- Índice simple para búsquedas por correo (opcional, omite si ya existe)
CREATE INDEX IF NOT EXISTS idx_prospectos_email ON prospectos(email);
