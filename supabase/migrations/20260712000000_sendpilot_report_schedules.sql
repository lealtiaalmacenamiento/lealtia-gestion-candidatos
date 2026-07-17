-- Configuración de reportes programados de SendPilot.
-- La tabla queda cerrada por RLS; el CRM la administra desde endpoints con service role.

CREATE TABLE IF NOT EXISTS public.sp_reportes_programados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL DEFAULT 'Reporte SendPilot',
  campana_id uuid NOT NULL REFERENCES public.sp_campanas(id) ON DELETE CASCADE,
  destinatarios text[] NOT NULL DEFAULT '{}'::text[],
  frecuencia_dias integer NOT NULL DEFAULT 7 CHECK (frecuencia_dias BETWEEN 1 AND 365),
  activo boolean NOT NULL DEFAULT true,
  ultimo_envio_at timestamptz,
  proximo_envio_at timestamptz,
  ultimo_resultado jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sp_reportes_programados_due
  ON public.sp_reportes_programados(activo, proximo_envio_at);

CREATE INDEX IF NOT EXISTS idx_sp_reportes_programados_campana
  ON public.sp_reportes_programados(campana_id);

ALTER TABLE public.sp_reportes_programados ENABLE ROW LEVEL SECURITY;

