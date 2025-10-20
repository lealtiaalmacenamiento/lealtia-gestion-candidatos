-- Permitir proveedor 'teams' en tokens_integracion y migrar 'microsoft' existentes

ALTER TABLE tokens_integracion
    DROP CONSTRAINT IF EXISTS tokens_integracion_proveedor_check;

UPDATE tokens_integracion
SET proveedor = 'teams'
WHERE proveedor = 'microsoft';

ALTER TABLE tokens_integracion
    ADD CONSTRAINT tokens_integracion_proveedor_check
    CHECK (proveedor IN ('google', 'zoom', 'teams'));
