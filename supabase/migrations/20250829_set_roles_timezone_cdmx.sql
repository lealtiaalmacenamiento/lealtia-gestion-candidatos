-- Migration: Set Postgres role session timezone to America/Mexico_City
-- Fecha: 2025-08-29
-- Objetivo: Asegurar que las sesiones (p.ej. RLS/funciones) utilicen la zona horaria CDMX
-- Nota: Los valores timestamptz seguirán almacenados en UTC internamente; esto sólo afecta la representación por defecto.

-- Roles estándar de Supabase (usamos DO para evitar problemas de linters)
DO $$ BEGIN
	EXECUTE 'ALTER ROLE anon SET timezone = ''America/Mexico_City''';
	EXECUTE 'ALTER ROLE authenticated SET timezone = ''America/Mexico_City''';
	EXECUTE 'ALTER ROLE service_role SET timezone = ''America/Mexico_City''';
END $$;

-- Agrega aquí otros roles personalizados si existen
-- DO $$ BEGIN EXECUTE 'ALTER ROLE administrador SET timezone = ''America/Mexico_City'''; END $$;

-- Verificación (se puede ejecutar manualmente, no se almacena resultado):
-- SHOW TIMEZONE; -- debería devolver 'America/Mexico_City'

-- Ejemplo de comparación de hora (ejecutar manualmente si se desea):
-- SELECT now()                                AS now_session,
--        now() AT TIME ZONE 'UTC'             AS now_utc,
--        now() AT TIME ZONE 'America/Mexico_City' AS now_cdmx;

-- Si en el futuro se requiere revertir:
-- ALTER ROLE anon RESET timezone;
-- ALTER ROLE authenticated RESET timezone;
-- ALTER ROLE service_role RESET timezone;
