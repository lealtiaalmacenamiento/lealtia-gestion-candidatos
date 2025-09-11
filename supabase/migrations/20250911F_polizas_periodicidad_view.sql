


SELECT 
	p.id,
	p.cliente_id,
	p.numero_poliza,
	p.estatus,
	p.forma_pago, -- método de cobro
	p.periodicidad_pago, -- frecuencia A/S/T/M
	p.prima_input,
	p.prima_moneda,
	p.sa_input,
	p.sa_moneda,
	p.fecha_emision,
	p.fecha_renovacion,
	p.tipo_pago,
	p.dia_pago,
	p.meses_check,
	p.producto_parametro_id,
	p.fecha_alta_sistema
FROM polizas p;


-- DROP TRIGGER IF EXISTS polizas_ui_trigger ON polizas_ui;
-- CREATE TRIGGER polizas_ui_trigger
--   INSTEAD OF INSERT OR UPDATE ON polizas_ui
--   FOR EACH ROW EXECUTE FUNCTION polizas_ui_upsert();
