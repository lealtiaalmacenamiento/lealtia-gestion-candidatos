-- Migración: agregar columna auto_pago a polizas
-- Permite que pólizas sean marcadas automáticamente como pagadas por el cron diario
-- cuando llega la fecha programada. Los desarrolladores comerciales y supervisores
-- pueden activar/desactivar esta bandera.

ALTER TABLE polizas
  ADD COLUMN IF NOT EXISTS auto_pago boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN polizas.auto_pago IS
  'Si true, el cron diario marca los pagos como pagados automáticamente al llegar la fecha_programada con el monto_programado.';
