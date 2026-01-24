-- Fix: Corregir caracteres especiales en descripciones de puntos_thresholds
-- Date: 2026-01-22

UPDATE puntos_thresholds 
SET descripcion = 'Prima de $7,500 o mas'
WHERE tipo_producto = 'GMM' 
  AND umbral_min = 7500 
  AND umbral_max IS NULL;

UPDATE puntos_thresholds 
SET descripcion = 'Prima de $150,000 o mas'
WHERE tipo_producto = 'VI' 
  AND umbral_min = 150000 
  AND umbral_max IS NULL;
