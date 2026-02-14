-- Tabla de códigos de agente para referidos desde landing page
-- Habilitar extensión unaccent si no está habilitada (para normalización de nombres)
CREATE EXTENSION IF NOT EXISTS unaccent;

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

-- Función temporal para generar código de agente (iniciales + últimos 4 dígitos CT)
CREATE OR REPLACE FUNCTION temp_generate_agent_code(nombre TEXT, ct TEXT)
RETURNS TEXT AS $$
DECLARE
  initials TEXT := '';
  last4 TEXT := '';
  word TEXT;
  clean_ct TEXT;
BEGIN
  -- Extraer iniciales: normalizar, quitar diacríticos, tomar primera letra de cada palabra
  IF nombre IS NULL OR trim(nombre) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Normalizar y quitar acentos (NFD decomposition + quitar diacríticos)
  nombre := unaccent(trim(nombre));
  
  -- Tomar primera letra de cada palabra
  FOREACH word IN ARRAY regexp_split_to_array(nombre, E'\\s+') LOOP
    IF word != '' THEN
      initials := initials || upper(substring(word, 1, 1));
    END IF;
  END LOOP;
  
  -- Extraer últimos 4 dígitos del CT
  IF ct IS NULL OR trim(ct) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Quitar todo excepto dígitos
  clean_ct := regexp_replace(ct::TEXT, '[^0-9]', '', 'g');
  
  IF length(clean_ct) < 4 THEN
    RETURN NULL;
  END IF;
  
  last4 := right(clean_ct, 4);
  
  -- Retornar código en mayúsculas
  RETURN upper(initials || last4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Insertar códigos para usuarios existentes que tengan candidatos con CT
-- Toma el primer candidato por usuario (ordenado por fecha de creación)
WITH first_candidate_per_user AS (
  SELECT DISTINCT ON (u.id)
    u.id as usuario_id,
    u.email as usuario_email,
    c.candidato,
    c.ct,
    COALESCE(u.nombre, c.candidato, u.email) as nombre_agente
  FROM usuarios u
  INNER JOIN candidatos c ON lower(c.email_agente) = lower(u.email)
  WHERE u.activo = true
    AND c.eliminado = false
    AND c.ct IS NOT NULL
    AND trim(c.ct::TEXT) != ''
    AND c.candidato IS NOT NULL
    AND trim(c.candidato) != ''
  ORDER BY u.id, c.created_at ASC
)
INSERT INTO public.agent_codes (code, agente_id, nombre_agente, activo)
SELECT 
  temp_generate_agent_code(fc.candidato, fc.ct) as code,
  fc.usuario_id as agente_id,
  fc.nombre_agente,
  true as activo
FROM first_candidate_per_user fc
WHERE temp_generate_agent_code(fc.candidato, fc.ct) IS NOT NULL
ON CONFLICT (code) DO NOTHING;

-- Eliminar función temporal
DROP FUNCTION IF EXISTS temp_generate_agent_code(TEXT, TEXT);

