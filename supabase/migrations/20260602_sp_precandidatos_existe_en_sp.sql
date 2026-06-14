-- Añadir columna existe_en_sp a sp_precandidatos
-- true  = el lead sigue activo en la campaña de SendPilot
-- false = SP ya no lo incluye (removido/filtrado), pero conservamos historial

ALTER TABLE sp_precandidatos
  ADD COLUMN IF NOT EXISTS existe_en_sp boolean NOT NULL DEFAULT true;
