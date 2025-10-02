-- Agrega nuevo estado 'ya_es_cliente' a la restricción CHECK de prospectos
ALTER TABLE prospectos
  DROP CONSTRAINT IF EXISTS prospectos_estado_check;

-- Nombrar de forma consistente (Postgres genera nombre automático si no se especificó; aseguramos uno explícito)
ALTER TABLE prospectos
  ADD CONSTRAINT prospectos_estado_check
  CHECK (estado IN ('pendiente','seguimiento','con_cita','descartado','ya_es_cliente'));

-- Opcional: actualizar filas antiguas que llegasen a tener el nuevo valor (no aplica aquí)
-- UPDATE prospectos SET estado='ya_es_cliente' WHERE estado='cliente'; -- ejemplo si hubiera valor previo distinto
