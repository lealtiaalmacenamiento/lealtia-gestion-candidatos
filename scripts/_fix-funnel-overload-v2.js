require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const SQL_DROP_3PARAM = `DROP FUNCTION IF EXISTS public.rpc_exec_funnel(date, date, uuid);`;

const SQL_CREATE_1PARAM = `
CREATE OR REPLACE FUNCTION public.rpc_exec_funnel(
  p_asesor_auth_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asesor_usuario_id bigint;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  IF p_asesor_auth_id IS NOT NULL THEN
    SELECT id INTO v_asesor_usuario_id FROM usuarios
    WHERE id_auth = p_asesor_auth_id LIMIT 1;
  END IF;

  RETURN (
    WITH per_cand AS (
      SELECT
        CASE
          WHEN COALESCE((c.etapas_completadas->'periodo_para_registro_y_envio_de_documentos'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'capacitacion_cedula_a1'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'periodo_para_ingresar_folio_oficina_virtual'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'periodo_para_playbook'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'pre_escuela_sesion_unica_de_arranque'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'fecha_limite_para_presentar_curricula_cdp'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'inicio_escuela_fundamental'->>'completed')::bool, false)
            THEN 'agente'
          WHEN c.fecha_creacion_pop IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'fecha_creacion_pop'->>'completed')::bool, false)
            AND NOT COALESCE((c.etapas_completadas->'fecha_creacion_ct'->>'completed')::bool, false)
            THEN 'prospeccion'
          WHEN c.periodo_para_registro_y_envio_de_documentos IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'periodo_para_registro_y_envio_de_documentos'->>'completed')::bool, false)
            THEN 'registro'
          WHEN c.capacitacion_cedula_a1 IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'capacitacion_cedula_a1'->>'completed')::bool, false)
            THEN 'capacitacion_a1'
          WHEN c.fecha_tentativa_de_examen IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'fecha_tentativa_de_examen'->>'completed')::bool, false)
            THEN 'examen'
          WHEN c.periodo_para_ingresar_folio_oficina_virtual IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'periodo_para_ingresar_folio_oficina_virtual'->>'completed')::bool, false)
            THEN 'folio_ov'
          WHEN c.periodo_para_playbook IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'periodo_para_playbook'->>'completed')::bool, false)
            THEN 'playbook'
          WHEN c.pre_escuela_sesion_unica_de_arranque IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'pre_escuela_sesion_unica_de_arranque'->>'completed')::bool, false)
            THEN 'pre_escuela'
          WHEN c.fecha_limite_para_presentar_curricula_cdp IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'fecha_limite_para_presentar_curricula_cdp'->>'completed')::bool, false)
            THEN 'curricula_cdp'
          WHEN c.inicio_escuela_fundamental IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'inicio_escuela_fundamental'->>'completed')::bool, false)
            THEN 'escuela_fundamental'
          ELSE 'prospeccion'
        END AS fase
      FROM candidatos c
      LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
      WHERE c.eliminado = false
        AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id)
    ),
    counts AS (
      SELECT fase, COUNT(*) AS cnt FROM per_cand GROUP BY fase
    ),
    phase_order(fase, orden, label) AS (
      VALUES
        ('prospeccion',         1, 'Prospección'),
        ('registro',            2, 'Registro y envío'),
        ('capacitacion_a1',     3, 'Capacitación A1'),
        ('examen',              4, 'Examen'),
        ('folio_ov',            5, 'Folio Oficina Virtual'),
        ('playbook',            6, 'Playbook'),
        ('pre_escuela',         7, 'Pre-escuela'),
        ('curricula_cdp',       8, 'Currícula CDP'),
        ('escuela_fundamental', 9, 'Escuela Fundamental'),
        ('agente',             10, 'Agente')
    ),
    total_cte AS (SELECT SUM(cnt)::numeric AS total FROM counts)
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'key',        po.fase,
          'label',      po.label,
          'count',      COALESCE(cn.cnt, 0),
          'porcentaje', ROUND(COALESCE(cn.cnt, 0)::numeric / NULLIF(tc.total, 0) * 100, 1)
        )
        ORDER BY po.orden
      ),
      '[]'::jsonb
    )
    FROM phase_order po
    CROSS JOIN total_cte tc
    LEFT JOIN counts cn ON cn.fase = po.fase
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_exec_funnel(uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_exec_funnel(uuid) IS
  'Embudo de candidatos con 9 fases. Sin filtro de periodo — muestra todos los candidatos activos. Filterable por asesor.';
`;

async function main() {
  const client = new Client({ connectionString: process.env.MainDATABASE_URL });
  try {
    await client.connect();
    console.log('🔌 Conectado a PRODUCCIÓN\n');

    console.log('🗑️  Eliminando versión 3-param (legacy, con filtro de fecha)...');
    await client.query(SQL_DROP_3PARAM);
    console.log('  ✅ rpc_exec_funnel(date, date, uuid) eliminada\n');

    console.log('🔧 Creando versión 1-param (9 fases, todos los candidatos)...');
    await client.query(SQL_CREATE_1PARAM);
    console.log('  ✅ rpc_exec_funnel(uuid) creada\n');

    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('✅ Schema cache recargado');
    console.log('\n🎉 Fix aplicado exitosamente.');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
