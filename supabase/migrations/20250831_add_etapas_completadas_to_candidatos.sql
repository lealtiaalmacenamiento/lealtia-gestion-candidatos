-- Add JSONB column to track completion of MES/EFC related etapas
ALTER TABLE candidatos ADD COLUMN etapas_completadas jsonb;

-- Optional: comment for documentation
COMMENT ON COLUMN candidatos.etapas_completadas IS 'Estado de completado por etapa (MES/EFC) con metadatos: { "periodo_para_registro_y_envio_de_documentos": { completed, by:{email,nombre}, at }, ... }';
