-- Migration: Add puntos_thresholds table for configurable point calculation
-- Date: 2026-01-22

-- Tabla para configurar umbrales de puntos por tipo de producto
CREATE TABLE IF NOT EXISTS puntos_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_producto tipo_producto NOT NULL,
  umbral_min numeric(14,2) NOT NULL,
  umbral_max numeric(14,2) NULL,
  puntos numeric(10,2) NOT NULL,
  clasificacion tipo_clasificacion_puntos NOT NULL,
  descripcion text NULL,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  creado_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_puntos_thresholds_umbral_valido CHECK (umbral_max IS NULL OR umbral_max > umbral_min)
);

CREATE INDEX IF NOT EXISTS idx_puntos_thresholds_lookup 
  ON puntos_thresholds(tipo_producto, activo, orden) 
  WHERE activo = true;

-- Insertar valores por defecto (equivalentes a la lógica hardcodeada actual)
INSERT INTO puntos_thresholds (tipo_producto, umbral_min, umbral_max, puntos, clasificacion, descripcion, orden) VALUES
-- GMM: 0.5 puntos si prima >= 7500, else 0
('GMM', 0, 7500, 0, 'CERO', 'Prima menor a $7,500', 1),
('GMM', 7500, NULL, 0.5, 'MEDIO', 'Prima de $7,500 o más', 2),

-- VI: 0 (<15k), 1 (15k-50k), 2 (50k-150k), 3 (>=150k)
('VI', 0, 15000, 0, 'CERO', 'Prima menor a $15,000', 1),
('VI', 15000, 50000, 1, 'SIMPLE', 'Prima entre $15,000 y $50,000', 2),
('VI', 50000, 150000, 2, 'DOBLE', 'Prima entre $50,000 y $150,000', 3),
('VI', 150000, NULL, 3, 'TRIPLE', 'Prima de $150,000 o más', 4);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp_puntos_thresholds()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_puntos_thresholds ON puntos_thresholds;
CREATE TRIGGER set_timestamp_puntos_thresholds
  BEFORE UPDATE ON puntos_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp_puntos_thresholds();

-- RLS policies (solo admin/supervisor pueden modificar)
ALTER TABLE puntos_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden ver puntos_thresholds" ON puntos_thresholds
  FOR SELECT
  USING (true);

CREATE POLICY "Solo admin/supervisor pueden modificar puntos_thresholds" ON puntos_thresholds
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id_auth::text = auth.uid()::text
      AND rol IN ('admin', 'supervisor')
    )
  );
