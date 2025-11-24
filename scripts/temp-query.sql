-- Buscar usuario y cliente
SELECT u.id, u.id_auth, u.email, u.rol 
FROM usuarios u 
WHERE u.email = 'orozco.jaime25@gmail.com';

-- Buscar clientes del usuario
SELECT c.id, c.primer_nombre, c.primer_apellido, c.asesor_id, c.activo
FROM clientes c
WHERE c.asesor_id = 'eb70746d-19a5-4b27-b4af-67ed052c9e83'
LIMIT 3;

-- Buscar productos parametrizados activos
SELECT id, nombre_comercial, tipo_producto
FROM producto_parametros
WHERE activo = true
LIMIT 5;

-- Verificar tipos de columnas
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'polizas' AND column_name IN ('producto_parametro_id', 'cliente_id');
