-- Script para ajustar candidatos en Dev para probar embudo y alertas
-- Distribución de escenarios:
-- 1. Prospección (ID 2) - recién creado
-- 2. Registro (ID 19) - con fecha próxima (5 días)
-- 3. Capacitación A1 (ID 14) - con fecha urgente (2 días)
-- 4. Examen (ID 20) - vencido (hace 3 días)
-- 5. Folio OV (ID 15) - fecha en 10 días
-- 6. Playbook (ID 21 - nuevo) - fecha en 12 días
-- 7. Pre-escuela (ID 22 - nuevo) - fecha en 20 días
-- 8. Currícula CDP (ID 23 - nuevo) - completado sin fecha próxima
-- 9. Escuela Fundamental (ID 24 - nuevo) - todas completadas menos última
-- 10. Agente (ID 25 - nuevo) - todas completadas

-- Actualizar candidatos existentes
BEGIN;

-- ID 2: Prospección (jaime eduardo) - solo fecha creación
UPDATE candidatos 
SET 
  fecha_creacion_pop = CURRENT_DATE,
  fecha_creacion_ct = CURRENT_DATE,
  periodo_para_registro_y_envio_de_documentos = NULL,
  capacitacion_cedula_a1 = NULL,
  fecha_tentativa_de_examen = NULL,
  periodo_para_ingresar_folio_oficina_virtual = NULL,
  periodo_para_playbook = NULL,
  pre_escuela_sesion_unica_de_arranque = NULL,
  fecha_limite_para_presentar_curricula_cdp = NULL,
  inicio_escuela_fundamental = NULL,
  etapas_completadas = '{}'::jsonb
WHERE id_candidato = 2;

-- ID 19: Registro (pepe lepu) - fecha en 5 días (warning)
UPDATE candidatos 
SET 
  fecha_creacion_pop = (CURRENT_DATE - INTERVAL '3 days')::date,
  periodo_para_registro_y_envio_de_documentos = to_char(CURRENT_DATE + INTERVAL '5 days', 'DD/MM/YYYY'),
  capacitacion_cedula_a1 = NULL,
  fecha_tentativa_de_examen = NULL,
  periodo_para_ingresar_folio_oficina_virtual = NULL,
  periodo_para_playbook = NULL,
  pre_escuela_sesion_unica_de_arranque = NULL,
  fecha_limite_para_presentar_curricula_cdp = NULL,
  inicio_escuela_fundamental = NULL,
  etapas_completadas = jsonb_build_object(
    'fecha_creacion_pop', jsonb_build_object('completed', true, 'fecha', (CURRENT_DATE - INTERVAL '3 days')::text)
  )
WHERE id_candidato = 19;

-- ID 14: Capacitación A1 (Jaime Orozco) - fecha en 2 días (urgent)
UPDATE candidatos 
SET 
  fecha_creacion_pop = (CURRENT_DATE - INTERVAL '10 days')::date,
  periodo_para_registro_y_envio_de_documentos = to_char(CURRENT_DATE - INTERVAL '5 days', 'DD/MM/YYYY'),
  capacitacion_cedula_a1 = to_char(CURRENT_DATE + INTERVAL '2 days', 'DD "de" TMMonth'),
  fecha_tentativa_de_examen = NULL,
  periodo_para_ingresar_folio_oficina_virtual = NULL,
  periodo_para_playbook = NULL,
  pre_escuela_sesion_unica_de_arranque = NULL,
  fecha_limite_para_presentar_curricula_cdp = NULL,
  inicio_escuela_fundamental = NULL,
  etapas_completadas = jsonb_build_object(
    'fecha_creacion_pop', jsonb_build_object('completed', true, 'fecha', (CURRENT_DATE - INTERVAL '10 days')::text),
    'periodo_para_registro_y_envio_de_documentos', jsonb_build_object('completed', true, 'fecha', (CURRENT_DATE - INTERVAL '5 days')::text)
  )
WHERE id_candidato = 14;

-- ID 20: Examen (Reto 5000 Demo) - vencido hace 3 días (critical)
UPDATE candidatos 
SET 
  fecha_creacion_pop = (CURRENT_DATE - INTERVAL '20 days')::date,
  periodo_para_registro_y_envio_de_documentos = to_char(CURRENT_DATE - INTERVAL '15 days', 'DD/MM/YYYY'),
  capacitacion_cedula_a1 = to_char(CURRENT_DATE - INTERVAL '10 days', 'DD "de" TMMonth'),
  fecha_tentativa_de_examen = (CURRENT_DATE - INTERVAL '3 days')::date,
  periodo_para_ingresar_folio_oficina_virtual = NULL,
  periodo_para_playbook = NULL,
  pre_escuela_sesion_unica_de_arranque = NULL,
  fecha_limite_para_presentar_curricula_cdp = NULL,
  inicio_escuela_fundamental = NULL,
  etapas_completadas = jsonb_build_object(
    'fecha_creacion_pop', jsonb_build_object('completed', true, 'fecha', (CURRENT_DATE - INTERVAL '20 days')::text),
    'periodo_para_registro_y_envio_de_documentos', jsonb_build_object('completed', true, 'fecha', (CURRENT_DATE - INTERVAL '15 days')::text),
    'capacitacion_cedula_a1', jsonb_build_object('completed', true, 'fecha', (CURRENT_DATE - INTERVAL '10 days')::text)
  )
WHERE id_candidato = 20;

-- ID 15: Folio OV (aaaaa) - fecha en 10 días (info)
UPDATE candidatos 
SET 
  fecha_creacion_pop = (CURRENT_DATE - INTERVAL '25 days')::date,
  periodo_para_registro_y_envio_de_documentos = to_char(CURRENT_DATE - INTERVAL '20 days', 'DD/MM/YYYY'),
  capacitacion_cedula_a1 = to_char(CURRENT_DATE - INTERVAL '15 days', 'DD "de" TMMonth'),
  fecha_tentativa_de_examen = (CURRENT_DATE - INTERVAL '10 days')::date,
  periodo_para_ingresar_folio_oficina_virtual = to_char(CURRENT_DATE + INTERVAL '10 days', 'DD/MM/YYYY'),
  periodo_para_playbook = NULL,
  pre_escuela_sesion_unica_de_arranque = NULL,
  fecha_limite_para_presentar_curricula_cdp = NULL,
  inicio_escuela_fundamental = NULL,
  etapas_completadas = jsonb_build_object(
    'fecha_creacion_pop', jsonb_build_object('completed', true, 'fecha', (CURRENT_DATE - INTERVAL '25 days')::text),
    'periodo_para_registro_y_envio_de_documentos', jsonb_build_object('completed', true, 'fecha', (CURRENT_DATE - INTERVAL '20 days')::text),
    'capacitacion_cedula_a1', jsonb_build_object('completed', true, 'fecha', (CURRENT_DATE - INTERVAL '15 days')::text),
    'fecha_tentativa_de_examen', jsonb_build_object('completed', true, 'fecha', (CURRENT_DATE - INTERVAL '10 days')::text)
  )
WHERE id_candidato = 15;

-- Insertar nuevos candidatos para cubrir todas las fases

-- ID 21: Playbook - fecha en 12 días
INSERT INTO candidatos (
  candidato, ct, pop, email_agente, mes_conexion, mes, efc,
  fecha_creacion_pop, fecha_creacion_ct,
  periodo_para_registro_y_envio_de_documentos,
  capacitacion_cedula_a1,
  fecha_tentativa_de_examen,
  periodo_para_ingresar_folio_oficina_virtual,
  periodo_para_playbook,
  etapas_completadas,
  fecha_de_creacion, ultima_actualizacion,
  usuario_creador, usuario_que_actualizo
) VALUES (
  'Ana García', '12000', '333444555', 'ana.test@example.com', '12/2025', 'DIC-2', 'DICIEMBRE',
  (CURRENT_DATE - INTERVAL '30 days')::date, (CURRENT_DATE - INTERVAL '30 days')::date,
  to_char(CURRENT_DATE - INTERVAL '25 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '20 days', 'DD "de" TMMonth'),
  (CURRENT_DATE - INTERVAL '15 days')::date,
  to_char(CURRENT_DATE - INTERVAL '10 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE + INTERVAL '12 days', 'DD/MM/YYYY'),
  jsonb_build_object(
    'fecha_creacion_pop', jsonb_build_object('completed', true),
    'periodo_para_registro_y_envio_de_documentos', jsonb_build_object('completed', true),
    'capacitacion_cedula_a1', jsonb_build_object('completed', true),
    'fecha_tentativa_de_examen', jsonb_build_object('completed', true),
    'periodo_para_ingresar_folio_oficina_virtual', jsonb_build_object('completed', true)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  'jaiomar98@hotmail.com', 'jaiomar98@hotmail.com'
) ON CONFLICT (id_candidato) DO NOTHING;

-- ID 22: Pre-escuela - fecha en 20 días
INSERT INTO candidatos (
  candidato, ct, pop, email_agente, mes_conexion, mes, efc,
  fecha_creacion_pop, fecha_creacion_ct,
  periodo_para_registro_y_envio_de_documentos,
  capacitacion_cedula_a1,
  fecha_tentativa_de_examen,
  periodo_para_ingresar_folio_oficina_virtual,
  periodo_para_playbook,
  pre_escuela_sesion_unica_de_arranque,
  etapas_completadas,
  fecha_de_creacion, ultima_actualizacion,
  usuario_creador, usuario_que_actualizo
) VALUES (
  'Carlos Ruiz', '12001', '444555666', 'carlos.test@example.com', '12/2025', 'DIC-1', 'DICIEMBRE',
  (CURRENT_DATE - INTERVAL '35 days')::date, (CURRENT_DATE - INTERVAL '35 days')::date,
  to_char(CURRENT_DATE - INTERVAL '30 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '25 days', 'DD "de" TMMonth'),
  (CURRENT_DATE - INTERVAL '20 days')::date,
  to_char(CURRENT_DATE - INTERVAL '15 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '10 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE + INTERVAL '20 days', 'DD/MM/YYYY'),
  jsonb_build_object(
    'fecha_creacion_pop', jsonb_build_object('completed', true),
    'periodo_para_registro_y_envio_de_documentos', jsonb_build_object('completed', true),
    'capacitacion_cedula_a1', jsonb_build_object('completed', true),
    'fecha_tentativa_de_examen', jsonb_build_object('completed', true),
    'periodo_para_ingresar_folio_oficina_virtual', jsonb_build_object('completed', true),
    'periodo_para_playbook', jsonb_build_object('completed', true)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  'jaiomar98@hotmail.com', 'jaiomar98@hotmail.com'
) ON CONFLICT (id_candidato) DO NOTHING;

-- ID 23: Currícula CDP - fecha pasada pero completada (no debe aparecer en alertas)
INSERT INTO candidatos (
  candidato, ct, pop, email_agente, mes_conexion, mes, efc,
  fecha_creacion_pop, fecha_creacion_ct,
  periodo_para_registro_y_envio_de_documentos,
  capacitacion_cedula_a1,
  fecha_tentativa_de_examen,
  periodo_para_ingresar_folio_oficina_virtual,
  periodo_para_playbook,
  pre_escuela_sesion_unica_de_arranque,
  fecha_limite_para_presentar_curricula_cdp,
  etapas_completadas,
  fecha_de_creacion, ultima_actualizacion,
  usuario_creador, usuario_que_actualizo
) VALUES (
  'Diana López', '12002', '555666777', 'diana.test@example.com', '12/2025', 'NOV-2', 'NOVIEMBRE',
  (CURRENT_DATE - INTERVAL '40 days')::date, (CURRENT_DATE - INTERVAL '40 days')::date,
  to_char(CURRENT_DATE - INTERVAL '35 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '30 days', 'DD "de" TMMonth'),
  (CURRENT_DATE - INTERVAL '25 days')::date,
  to_char(CURRENT_DATE - INTERVAL '20 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '15 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '10 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE + INTERVAL '30 days', 'DD/MM/YYYY'),
  jsonb_build_object(
    'fecha_creacion_pop', jsonb_build_object('completed', true),
    'periodo_para_registro_y_envio_de_documentos', jsonb_build_object('completed', true),
    'capacitacion_cedula_a1', jsonb_build_object('completed', true),
    'fecha_tentativa_de_examen', jsonb_build_object('completed', true),
    'periodo_para_ingresar_folio_oficina_virtual', jsonb_build_object('completed', true),
    'periodo_para_playbook', jsonb_build_object('completed', true),
    'pre_escuela_sesion_unica_de_arranque', jsonb_build_object('completed', true)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  'jaiomar98@hotmail.com', 'jaiomar98@hotmail.com'
) ON CONFLICT (id_candidato) DO NOTHING;

-- ID 24: Escuela Fundamental - todas completadas menos la última
INSERT INTO candidatos (
  candidato, ct, pop, email_agente, mes_conexion, mes, efc,
  fecha_creacion_pop, fecha_creacion_ct,
  periodo_para_registro_y_envio_de_documentos,
  capacitacion_cedula_a1,
  fecha_tentativa_de_examen,
  periodo_para_ingresar_folio_oficina_virtual,
  periodo_para_playbook,
  pre_escuela_sesion_unica_de_arranque,
  fecha_limite_para_presentar_curricula_cdp,
  inicio_escuela_fundamental,
  etapas_completadas,
  fecha_de_creacion, ultima_actualizacion,
  usuario_creador, usuario_que_actualizo
) VALUES (
  'Eduardo Sánchez', '12003', '666777888', 'eduardo.test@example.com', '11/2025', 'NOV-1', 'NOVIEMBRE',
  (CURRENT_DATE - INTERVAL '45 days')::date, (CURRENT_DATE - INTERVAL '45 days')::date,
  to_char(CURRENT_DATE - INTERVAL '40 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '35 days', 'DD "de" TMMonth'),
  (CURRENT_DATE - INTERVAL '30 days')::date,
  to_char(CURRENT_DATE - INTERVAL '25 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '20 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '15 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '10 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE + INTERVAL '7 days', 'DD/MM/YYYY'),
  jsonb_build_object(
    'fecha_creacion_pop', jsonb_build_object('completed', true),
    'periodo_para_registro_y_envio_de_documentos', jsonb_build_object('completed', true),
    'capacitacion_cedula_a1', jsonb_build_object('completed', true),
    'fecha_tentativa_de_examen', jsonb_build_object('completed', true),
    'periodo_para_ingresar_folio_oficina_virtual', jsonb_build_object('completed', true),
    'periodo_para_playbook', jsonb_build_object('completed', true),
    'pre_escuela_sesion_unica_de_arranque', jsonb_build_object('completed', true),
    'fecha_limite_para_presentar_curricula_cdp', jsonb_build_object('completed', true)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  'jaiomar98@hotmail.com', 'jaiomar98@hotmail.com'
) ON CONFLICT (id_candidato) DO NOTHING;

-- ID 25: Agente - todas las etapas completadas
INSERT INTO candidatos (
  candidato, ct, pop, email_agente, mes_conexion, mes, efc,
  fecha_creacion_pop, fecha_creacion_ct,
  periodo_para_registro_y_envio_de_documentos,
  capacitacion_cedula_a1,
  fecha_tentativa_de_examen,
  periodo_para_ingresar_folio_oficina_virtual,
  periodo_para_playbook,
  pre_escuela_sesion_unica_de_arranque,
  fecha_limite_para_presentar_curricula_cdp,
  inicio_escuela_fundamental,
  etapas_completadas,
  fecha_de_creacion, ultima_actualizacion,
  usuario_creador, usuario_que_actualizo
) VALUES (
  'Fernanda Torres', '12004', '777888999', 'fernanda.test@example.com', '10/2025', 'OCT-2', 'OCTUBRE',
  (CURRENT_DATE - INTERVAL '50 days')::date, (CURRENT_DATE - INTERVAL '50 days')::date,
  to_char(CURRENT_DATE - INTERVAL '45 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '40 days', 'DD "de" TMMonth'),
  (CURRENT_DATE - INTERVAL '35 days')::date,
  to_char(CURRENT_DATE - INTERVAL '30 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '25 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '20 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '15 days', 'DD/MM/YYYY'),
  to_char(CURRENT_DATE - INTERVAL '10 days', 'DD/MM/YYYY'),
  jsonb_build_object(
    'periodo_para_registro_y_envio_de_documentos', jsonb_build_object('completed', true),
    'capacitacion_cedula_a1', jsonb_build_object('completed', true),
    'periodo_para_ingresar_folio_oficina_virtual', jsonb_build_object('completed', true),
    'periodo_para_playbook', jsonb_build_object('completed', true),
    'pre_escuela_sesion_unica_de_arranque', jsonb_build_object('completed', true),
    'fecha_limite_para_presentar_curricula_cdp', jsonb_build_object('completed', true),
    'inicio_escuela_fundamental', jsonb_build_object('completed', true)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  'jaiomar98@hotmail.com', 'jaiomar98@hotmail.com'
) ON CONFLICT (id_candidato) DO NOTHING;

COMMIT;

-- Verificar resultados
SELECT 
  id_candidato,
  candidato,
  CASE 
    WHEN etapas_completadas ? 'inicio_escuela_fundamental' 
      AND (etapas_completadas->'inicio_escuela_fundamental'->>'completed')::boolean = true 
      AND (etapas_completadas ? 'periodo_para_registro_y_envio_de_documentos')
      AND (etapas_completadas->'periodo_para_registro_y_envio_de_documentos'->>'completed')::boolean = true
      AND (etapas_completadas ? 'capacitacion_cedula_a1')
      AND (etapas_completadas->'capacitacion_cedula_a1'->>'completed')::boolean = true
      AND (etapas_completadas ? 'periodo_para_ingresar_folio_oficina_virtual')
      AND (etapas_completadas->'periodo_para_ingresar_folio_oficina_virtual'->>'completed')::boolean = true
      AND (etapas_completadas ? 'periodo_para_playbook')
      AND (etapas_completadas->'periodo_para_playbook'->>'completed')::boolean = true
      AND (etapas_completadas ? 'pre_escuela_sesion_unica_de_arranque')
      AND (etapas_completadas->'pre_escuela_sesion_unica_de_arranque'->>'completed')::boolean = true
      AND (etapas_completadas ? 'fecha_limite_para_presentar_curricula_cdp')
      AND (etapas_completadas->'fecha_limite_para_presentar_curricula_cdp'->>'completed')::boolean = true
    THEN 'Agente'
    WHEN inicio_escuela_fundamental IS NOT NULL THEN 'Escuela Fundamental'
    WHEN fecha_limite_para_presentar_curricula_cdp IS NOT NULL THEN 'Currícula CDP'
    WHEN pre_escuela_sesion_unica_de_arranque IS NOT NULL THEN 'Pre-escuela'
    WHEN periodo_para_playbook IS NOT NULL THEN 'Playbook'
    WHEN periodo_para_ingresar_folio_oficina_virtual IS NOT NULL THEN 'Folio OV'
    WHEN fecha_tentativa_de_examen IS NOT NULL THEN 'Examen'
    WHEN capacitacion_cedula_a1 IS NOT NULL THEN 'Capacitación A1'
    WHEN periodo_para_registro_y_envio_de_documentos IS NOT NULL THEN 'Registro'
    ELSE 'Prospección'
  END as fase_actual
FROM candidatos
ORDER BY id_candidato;

