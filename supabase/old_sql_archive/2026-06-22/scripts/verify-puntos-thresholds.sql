-- Script de verificación: Consulta puntos_thresholds y prueba recalc_puntos_poliza

-- 1. Ver umbrales configurados
SELECT 
  tipo_producto,
  orden,
  umbral_min,
  umbral_max,
  puntos,
  clasificacion,
  descripcion,
  activo
FROM puntos_thresholds
ORDER BY tipo_producto, orden;

-- 2. Probar recálculo en una póliza de prueba
-- Primero, veamos una póliza de ejemplo
SELECT 
  p.id,
  p.poliza_numero,
  p.prima,
  p.prima_moneda,
  p.estatus,
  pp.tipo_producto,
  pp.nombre_comercial,
  pc.puntos_total,
  pc.clasificacion
FROM polizas p
LEFT JOIN producto_parametros pp ON p.producto_parametro_id = pp.id
LEFT JOIN poliza_puntos_cache pc ON p.id = pc.poliza_id
WHERE p.estatus = 'EN_VIGOR'
LIMIT 5;

-- 3. Recalcular puntos de todas las pólizas en vigor para aplicar nuevos umbrales
-- (Comentado por seguridad - descomentar si quieres ejecutar)
-- DO $$
-- DECLARE
--   pol_record RECORD;
-- BEGIN
--   FOR pol_record IN 
--     SELECT id FROM polizas WHERE estatus = 'EN_VIGOR'
--   LOOP
--     PERFORM recalc_puntos_poliza(pol_record.id);
--   END LOOP;
-- END $$;
