-- Replanteo: se requiere usar SIEMPRE el valor ACTUAL (más reciente) de UDI y FX y no fallar por fecha_emision histórica.
-- Implementamos una VIEW que expone las pólizas con primas/SA revaluadas al valor UDI/USD más reciente.

DROP VIEW IF EXISTS polizas_valores_actuales;
CREATE VIEW polizas_valores_actuales AS
WITH latest_udi AS (
  SELECT valor AS udi_valor FROM udi_values ORDER BY fecha DESC LIMIT 1
), latest_fx AS (
  SELECT valor AS usd_fx FROM fx_values ORDER BY fecha DESC LIMIT 1
)
SELECT p.*,
  CASE 
    WHEN p.prima_moneda = 'MXN' THEN p.prima_input
    WHEN p.prima_moneda = 'USD' THEN p.prima_input * (SELECT usd_fx FROM latest_fx)
    WHEN p.prima_moneda = 'UDI' THEN p.prima_input * (SELECT udi_valor FROM latest_udi)
    ELSE p.prima_input
  END AS prima_mxn_actual,
  CASE 
    WHEN p.sa_moneda = 'MXN' THEN p.sa_input
    WHEN p.sa_moneda = 'USD' THEN p.sa_input * (SELECT usd_fx FROM latest_fx)
    WHEN p.sa_moneda = 'UDI' THEN p.sa_input * (SELECT udi_valor FROM latest_udi)
    ELSE p.sa_input
  END AS sa_mxn_actual,
  (SELECT udi_valor FROM latest_udi) AS udi_valor_usado,
  (SELECT usd_fx FROM latest_fx) AS usd_fx_usado
FROM polizas p;

-- Nota: si no existen filas en udi_values o fx_values la vista devolverá NULL en los campos *_actual.
