--
-- PostgreSQL database dump
--

\restrict JSCGcfmZebqGFyVsbFpYCl1MqfDetJOsmNGmV5elfBNT4ubvDyFb6owmYJjAyQg

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: campaigns_custom_metrics; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (12, 3, 'vida_grupo_inicial', 'polizas_validas', 2, NULL, NULL, '2025-11-18 06:23:14.715+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (13, 3, 'vida_grupo_inicial', 'ultimas_ventas_dias', 8, NULL, NULL, '2025-11-18 06:23:14.715+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (14, 3, 'meta_comisiones', 'meta_cumplida', NULL, 'true', NULL, '2025-11-18 06:23:14.715+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (15, 3, 'meta_comisiones', 'avance_actual', 412000, NULL, NULL, '2025-11-18 06:23:14.715+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (16, 3, 'meta_comisiones', 'meta_objetivo', 600000, NULL, NULL, '2025-11-18 06:23:14.715+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (17, 4, 'meta_comisiones', 'meta_cumplida', NULL, 'false', NULL, '2025-11-18 06:23:14.715+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (18, 4, 'meta_comisiones', 'avance_actual', 175000, NULL, NULL, '2025-11-18 06:23:14.715+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (19, 4, 'meta_comisiones', 'meta_objetivo', 420000, NULL, NULL, '2025-11-18 06:23:14.715+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (20, 4, 'vida_grupo_inicial', 'polizas_validas', 0, NULL, NULL, '2025-11-18 06:23:14.715+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (21, 6, 'ranking_r1', 'posicion', 5, NULL, NULL, '2025-11-18 06:23:14.715+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (22, 6, 'ranking_r1', 'puntos', 102, NULL, NULL, '2025-11-18 06:23:14.715+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (34, 14, 'vida_grupo_inicial', 'polizas_validas', 1, NULL, NULL, '2025-11-18 07:17:18.945484+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (35, 3, 'polizas_por_tipo', 'cantidad', 2, NULL, '{"product_types": ["VI"]}', '2025-11-20 06:28:57.879154+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (36, 3, 'polizas_prima_minima', 'cantidad', 2, NULL, '{"prima_minima_mxn": 25000}', '2025-11-20 06:28:57.879154+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (37, 3, 'polizas_recientes', 'ultima_emision_dias', 8, NULL, NULL, '2025-11-20 06:28:57.879154+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (38, 3, 'polizas_recientes', 'cantidad', 2, NULL, '{"dias_ventana": 30}', '2025-11-20 06:28:57.879154+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (42, 14, 'polizas_por_tipo', 'cantidad', 1, NULL, '{"product_types": ["VI"]}', '2025-11-20 06:28:57.879154+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (43, 14, 'polizas_prima_minima', 'cantidad', 1, NULL, '{"prima_minima_mxn": 25000}', '2025-11-20 06:28:57.879154+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (44, 14, 'polizas_recientes', 'cantidad', 1, NULL, '{"dias_ventana": 30}', '2025-11-20 06:28:57.879154+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (48, 4, 'polizas_recientes', 'ultima_emision_dias', 0, NULL, NULL, '2025-11-20 00:29:26.401833+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (49, 4, 'polizas_por_producto', 'cantidad', 2, NULL, '{"producto_ids": ["4a2d3fd5-7332-46aa-90f6-a7d3979a1719", "c389e603-be14-4d53-aa7d-ada5c958be7c"]}', '2025-11-20 00:41:05.195974+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (40, 4, 'polizas_prima_minima', 'cantidad', 2, NULL, '{"prima_minima_mxn": 25000}', '2025-11-20 16:55:09.593267+00');
INSERT INTO public.campaigns_custom_metrics (id, usuario_id, dataset, metric, numeric_value, text_value, "json_value", updated_at) VALUES (41, 4, 'polizas_recientes', 'cantidad', 2, NULL, '{"dias_ventana": 30}', '2025-11-20 16:55:09.593267+00');


--
-- Name: campaigns_custom_metrics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.campaigns_custom_metrics_id_seq', 51, true);


--
-- PostgreSQL database dump complete
--

\unrestrict JSCGcfmZebqGFyVsbFpYCl1MqfDetJOsmNGmV5elfBNT4ubvDyFb6owmYJjAyQg

