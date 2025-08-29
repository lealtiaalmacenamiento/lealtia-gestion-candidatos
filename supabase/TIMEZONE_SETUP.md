# Configuración de zona horaria (CDMX)

Opción A (recomendada): mantener almacenamiento en UTC (timestamptz) y fijar la zona horaria de las sesiones a `America/Mexico_City` para representación.

## Pasos manuales (ejecutar una sola vez en el SQL editor de Supabase)

```sql
ALTER ROLE anon SET timezone = 'America/Mexico_City';
ALTER ROLE authenticated SET timezone = 'America/Mexico_City';
ALTER ROLE service_role SET timezone = 'America/Mexico_City';
-- Agrega otros roles si los creas: ALTER ROLE <rol> SET timezone = 'America/Mexico_City';
```

Verificar:

```sql
SHOW timezone;                       -- Debe devolver America/Mexico_City (en nueva sesión)
SELECT now() AS now_session,
       now() AT TIME ZONE 'UTC' AS now_utc,
       now() AT TIME ZONE 'America/Mexico_City' AS now_cdmx;
```

Revertir (si fuera necesario):

```sql
ALTER ROLE anon RESET timezone;
ALTER ROLE authenticated RESET timezone;
ALTER ROLE service_role RESET timezone;
```

## Notas
* Los valores `timestamptz` siguen almacenados internamente en UTC; el ajuste sólo cambia la presentación por defecto al consultar sin conversión explícita.
* En el frontend seguimos formateando con `Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City' })` para consistencia.
* Evita convertir físicamente los datos: perderías la referencia UTC y podrías duplicar desplazamientos.

## Checklist de validación
- [ ] Ejecutados los `ALTER ROLE`.
- [ ] Nueva sesión `SHOW timezone` -> `America/Mexico_City`.
- [ ] Horas de citas coinciden entre UI, PDF y consultas directas.
