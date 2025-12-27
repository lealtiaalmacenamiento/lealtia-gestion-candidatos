-- Tabla: notificaciones (in-app)
-- Almacena notificaciones internas para usuarios (pagos vencidos, etc.)

CREATE TABLE IF NOT EXISTS notificaciones (
  id BIGSERIAL PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('pago_vencido', 'pago_proximo', 'comision_disponible', 'sistema')),
  titulo VARCHAR(255) NOT NULL,
  mensaje TEXT NOT NULL,
  leida BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb, -- Datos adicionales: {poliza_id, pago_id, etc.}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  leida_at TIMESTAMPTZ NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leida 
  ON notificaciones(usuario_id, leida, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notificaciones_tipo 
  ON notificaciones(tipo);

CREATE INDEX IF NOT EXISTS idx_notificaciones_created 
  ON notificaciones(created_at DESC);

-- RLS Policies
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo ven sus propias notificaciones
CREATE POLICY pol_notificaciones_select 
  ON notificaciones FOR SELECT 
  USING (usuario_id = auth.uid());

-- Los usuarios pueden marcar sus notificaciones como leídas
CREATE POLICY pol_notificaciones_update 
  ON notificaciones FOR UPDATE 
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

-- Solo el sistema (service_role) puede insertar notificaciones
-- (desde Edge Functions o triggers)
CREATE POLICY pol_notificaciones_insert 
  ON notificaciones FOR INSERT 
  WITH CHECK (true); -- Se controla a nivel de service_role key

COMMENT ON TABLE notificaciones IS 'Notificaciones in-app para usuarios (alertas de pagos, comisiones, sistema)';
COMMENT ON COLUMN notificaciones.tipo IS 'pago_vencido | pago_proximo | comision_disponible | sistema';
COMMENT ON COLUMN notificaciones.metadata IS 'Datos extras en JSON: {poliza_id, pago_id, monto, etc.}';
