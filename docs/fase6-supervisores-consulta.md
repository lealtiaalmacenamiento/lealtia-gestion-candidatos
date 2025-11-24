# Fase 6 · Supervisores y consulta de candidatos

## 1. Objetivos
1. Mostrar a supervisores la comisión esperada del mes por cada agente.
2. Centralizar alertas de pagos vencidos/próximos para todo el equipo.
3. Permitir ordenar y agrupar el listado de candidatos según proceso actual y fecha.

## 2. Dependencias
- Requiere la vista `vw_agente_comision_mes_actual` creada en el módulo de pagos.
- Endpoints nuevos /api/pagos/alertas y /api/agentes/{id}/comision-mes.
- Datos de candidatos con fase actual y fechas (ya expuestos en API de consulta).

## 3. Backend
### 3.1 Endpoints para supervisores
1. `GET /api/supervisores/{id}/agentes-comision`
   - Respuesta: lista de agentes con `comision_programada`, `comision_pagada`, `comision_pendiente`, `pagos_vencidos`.
   - Fuente: vista + `poliza_pagos_mensuales`.
2. `GET /api/supervisores/{id}/alertas`
   - Une alertas de pagos + candidatos (si se define) para mostrar resumen global.

### 3.2 Ordenamiento de candidatos
- Extender endpoint existente (`GET /api/candidatos`) con parámetros:
  - `order=phase_date` (default): orden por prioridad de fase (numeric rank) y `fecha_estado` desc.
  - `groupByPhase=true` opcional para devolver estructura `{ phase, items[] }`.
- Agregar índice en tabla de candidatos por `(fase_actual, fecha_estado)` para evitar scans.

## 4. Front-end Supervisores
### 4.1 Lista de agentes
- En la tarjeta/desplegable de cada agente:
  - Badge principal: `Comisión mes actual: $X`.
  - Subtexto: `Pagado Y · Pendiente Z · Vencidos N`.
  - Tooltip con tabla (póliza, monto, estado) usando datos del endpoint.
- Nueva sección "Alertas del equipo":
  - Tabs: `Pagos vencidos`, `Pagos próximos (<=7 días)`.
  - Cada item enlaza a la póliza correspondiente.

### 4.2 Experiencia de usuario
- Los badges deben actualizarse en vivo tras registrar pagos (usar SWR/React Query con revalidate 60s o suscripción Supabase).
- Colores consistentes con módulo de asesores.

## 5. Consulta de candidatos
1. **UI**
   - Selector "Ordenar por":
     - Proceso + fecha (default).
     - Última actividad.
     - Nombre.
   - Cuando la opción por proceso esté activa, mostrar headers por fase (Prospección, Entrevista, etc.).
   - Cada candidato lleva badge con color de fase (alineado al calendario del PDF).
2. **Lógica**
   - Mapear fases a prioridad numérica (ej. Prospecto=1, Entrevista=2...).
   - Mostrar fecha relevante (ej. `fecha_estado` o `fecha_proxima_actividad`).
3. **Accesibilidad**
   - Usar `aria-label` en botones de orden.
   - Para agrupar, emplear `role="heading"` en headers de fase.

## 6. QA Checklist
- Endpoint comisiones devuelve datos correctos para agente sin pagos (0s) y con varios pagos.
- UI: badge se actualiza tras registrar pago en módulo de asesores.
- Alertas: paginación y filtros funcionan en lista.
- Consulta candidatos: orden estable cuando dos candidatos comparten misma fase/fecha.
- Tests unitarios para función de ranking de fases.
- Documentar cómo agregar nuevas fases al ordenamiento (constante compartida UI/API).
