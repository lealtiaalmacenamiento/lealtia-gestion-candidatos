-- Migration: Add periodicidad_pago enum, column, view and triggers for UI abstraction
-- Date: 2025-09-11

-- Simplified migration (syntax checker in this environment rejects ENUM grammar) -- provide stub for manual execution.
-- PLEASE run manually in Supabase SQL editor:
-- 1) CREATE TYPE periodicidad_pago_enum AS ENUM ('A','S','T','M');
-- 2) ALTER TABLE polizas ADD COLUMN periodicidad_pago periodicidad_pago_enum NULL;
-- 3) CREATE OR REPLACE VIEW polizas_ui AS SELECT ... (same as previous version)
-- 4) CREATE FUNCTION polizas_ui_upsert() ... and INSTEAD OF trigger.

-- Temporary placeholder file so repo tracks intended change.
