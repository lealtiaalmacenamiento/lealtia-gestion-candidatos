-- Asegura unicidad por correo del candidato entre no eliminados usando la columna existente email_agente

-- Índice único lógico: asegura unicidad de email_agente solo cuando eliminado=false
CREATE UNIQUE INDEX IF NOT EXISTS ux_candidatos_email_agente_not_deleted
  ON candidatos ((CASE WHEN eliminado = false THEN email_agente ELSE NULL END));

-- Comentario: el correo del candidato se almacena en candidatos.email_agente y debe ser único entre no eliminados.
