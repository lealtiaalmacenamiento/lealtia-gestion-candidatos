-- Tabla de códigos de agente para referidos desde landing page
CREATE TABLE IF NOT EXISTS public.agent_codes (
  code TEXT PRIMARY KEY,
  agente_id BIGINT NOT NULL,
  nombre_agente TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  CONSTRAINT agent_codes_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_codes_activo ON public.agent_codes(activo, code);
CREATE INDEX IF NOT EXISTS idx_agent_codes_agente ON public.agent_codes(agente_id);

-- Comentarios
COMMENT ON TABLE public.agent_codes IS 'Códigos de referido para agentes (landing page)';
COMMENT ON COLUMN public.agent_codes.code IS 'Código único (ej: JMCT2024)';
COMMENT ON COLUMN public.agent_codes.agente_id IS 'ID del agente propietario del código';
COMMENT ON COLUMN public.agent_codes.nombre_agente IS 'Nombre del agente para referencia';
COMMENT ON COLUMN public.agent_codes.activo IS 'Si el código está activo';
COMMENT ON COLUMN public.agent_codes.expires_at IS 'Fecha de expiración opcional';

-- Habilitar RLS
ALTER TABLE public.agent_codes ENABLE ROW LEVEL SECURITY;

-- Política: agentes pueden ver sus propios códigos
CREATE POLICY "Agentes pueden ver sus códigos" ON public.agent_codes
  FOR SELECT
  USING (
    agente_id IN (
      SELECT id FROM usuarios WHERE id_auth = auth.uid()
    )
  );

-- Política: supervisores y admins pueden ver todos los códigos
CREATE POLICY "Supervisores pueden ver todos los códigos" ON public.agent_codes
  FOR SELECT
  USING (is_super_role());

-- Política: solo admins pueden crear/modificar códigos
CREATE POLICY "Solo admins pueden gestionar códigos" ON public.agent_codes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id_auth = auth.uid() 
      AND rol = 'admin'
    )
  );
