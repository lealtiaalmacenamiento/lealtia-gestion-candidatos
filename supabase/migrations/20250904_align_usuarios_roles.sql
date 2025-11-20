-- Align usuarios.rol CHECK constraint in main to match develop
-- Permit roles: admin, supervisor, viewer, agente

-- Drop existing CHECK (name assumed default)
ALTER TABLE public.usuarios DROP CONSTRAINT usuarios_rol_check;

-- Recreate CHECK with full allowed set
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('admin','supervisor','viewer','agente'));
