-- Flujo público: cuestionario -> simulación PPR -> cita Cal.com

ALTER TYPE meeting_provider ADD VALUE IF NOT EXISTS 'calcom';

CREATE TABLE IF NOT EXISTS public.questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  titulo text NOT NULL,
  descripcion text,
  secciones jsonb NOT NULL DEFAULT '[]'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  requiere_ppr boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.questionnaire_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  questionnaire_id uuid NOT NULL REFERENCES public.questionnaires(id) ON DELETE RESTRICT,
  questionnaire_version integer NOT NULL,
  questionnaire_snapshot jsonb NOT NULL,
  agente_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  agent_code text NOT NULL REFERENCES public.agent_codes(code) ON DELETE RESTRICT,
  cal_event_type_id integer,
  cal_event_title text,
  cal_booking_url text,
  views_count integer NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  activo boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.questionnaire_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.questionnaire_links(id) ON DELETE RESTRICT,
  questionnaire_id uuid NOT NULL REFERENCES public.questionnaires(id) ON DELETE RESTRICT,
  questionnaire_snapshot jsonb NOT NULL,
  respuestas jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado text NOT NULL DEFAULT 'cuestionario_completo'
    CHECK (estado IN ('iniciado', 'cuestionario_completo', 'simulacion_completa', 'cita_agendada', 'cancelado')),
  prospecto_id bigint REFERENCES public.prospectos(id) ON DELETE SET NULL,
  ppr_result jsonb,
  cal_booking_uid text,
  booking_start timestamptz,
  booking_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questionnaires_activo
  ON public.questionnaires(activo, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_questionnaire_links_agente
  ON public.questionnaire_links(agente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questionnaire_links_token_active
  ON public.questionnaire_links(token) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_questionnaire_submissions_link
  ON public.questionnaire_submissions(link_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_questionnaire_submission_booking
  ON public.questionnaire_submissions(cal_booking_uid)
  WHERE cal_booking_uid IS NOT NULL;

ALTER TABLE public.questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_submissions ENABLE ROW LEVEL SECURITY;

-- El acceso se realiza mediante endpoints del CRM con service role. Se dejan
-- las tablas cerradas por RLS para impedir lecturas públicas directas.

INSERT INTO public.questionnaires (
  slug,
  titulo,
  descripcion,
  secciones,
  activo,
  requiere_ppr
)
VALUES (
  'diagnostico-ppr',
  'Diagnóstico para tu Plan Personal de Retiro',
  'Conoce tu situación actual, simula una alternativa y agenda una sesión con tu asesor.',
  '[
    {
      "id": "datos_contacto",
      "titulo": "Datos de contacto",
      "preguntas": [
        {"id":"nombre","etiqueta":"Nombre completo","tipo":"texto","semantica":"nombre","requerida":true},
        {"id":"email","etiqueta":"Correo electrónico","tipo":"email","semantica":"email","requerida":true},
        {"id":"telefono","etiqueta":"Teléfono","tipo":"telefono","semantica":"telefono","requerida":true},
        {"id":"edad","etiqueta":"Edad","tipo":"numero","semantica":"edad","requerida":true}
      ]
    },
    {
      "id": "objetivos",
      "titulo": "Objetivos",
      "preguntas": [
        {"id":"edad_retiro","etiqueta":"¿A qué edad te gustaría retirarte?","tipo":"numero","semantica":"otro","requerida":true},
        {"id":"ahorro_actual","etiqueta":"¿Actualmente cuentas con ahorro para el retiro?","tipo":"booleano","semantica":"otro","requerida":true},
        {"id":"objetivo","etiqueta":"¿Qué te gustaría lograr con tu plan de retiro?","tipo":"texto_largo","semantica":"otro","requerida":false}
      ]
    }
  ]'::jsonb,
  true,
  true
)
ON CONFLICT (slug) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public."Parametros"') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public."Parametros" (tipo, clave, valor, descripcion, actualizado_en)
      SELECT
        'landing',
        'ppr_questionnaire_id',
        q.id::text,
        'Cuestionario PPR usado desde el botón de la landing principal',
        now()
      FROM public.questionnaires q
      WHERE q.slug = 'diagnostico-ppr'
        AND NOT EXISTS (
          SELECT 1
          FROM public."Parametros"
          WHERE tipo = 'landing'
            AND clave = 'ppr_questionnaire_id'
        )
      LIMIT 1
    $sql$;
  END IF;
END $$;
