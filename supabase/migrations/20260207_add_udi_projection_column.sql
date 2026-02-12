-- Agregar columna para marcar proyecciones de UDI
-- Esta columna permite diferenciar valores reales de Banxico vs proyecciones

-- Agregar columna is_projection a udi_values
ALTER TABLE udi_values 
ADD COLUMN IF NOT EXISTS is_projection BOOLEAN DEFAULT FALSE;

-- Agregar columna is_projection a fx_values (para futuro)
ALTER TABLE fx_values 
ADD COLUMN IF NOT EXISTS is_projection BOOLEAN DEFAULT FALSE;

-- Índices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_udi_projection ON udi_values(is_projection, fecha);
CREATE INDEX IF NOT EXISTS idx_udi_fecha_projection ON udi_values(fecha, is_projection);

CREATE INDEX IF NOT EXISTS idx_fx_projection ON fx_values(is_projection, fecha);
CREATE INDEX IF NOT EXISTS idx_fx_fecha_projection ON fx_values(fecha, is_projection);

-- Comentarios en las columnas
COMMENT ON COLUMN udi_values.is_projection IS 'Indica si el valor es una proyección (true) o dato real de Banxico (false)';
COMMENT ON COLUMN fx_values.is_projection IS 'Indica si el valor es una proyección (true) o dato real de Banxico (false)';

-- Actualizar valores existentes como no proyecciones
UPDATE udi_values 
SET is_projection = FALSE 
WHERE is_projection IS NULL;

UPDATE fx_values 
SET is_projection = FALSE 
WHERE is_projection IS NULL;
