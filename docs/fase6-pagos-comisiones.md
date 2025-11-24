# Fase 6 · Pagos mensuales y comisiones de pólizas

## 1. Objetivo funcional
- Permitir que asesores registren cobros mensuales de cada póliza y conocer la comisión esperada por periodo.
- Generar alertas cuando un pago esté próximo o vencido.
- Mostrar a supervisores el monto de comisión esperado en el mes en curso.

## 2. Modelo de datos
1. **Tabla `poliza_pagos_mensuales`**
   - `id` bigint PK.
   - `poliza_id` (uuid/bigint según esquema actual) FK -> `polizas` (cascade delete).
   - `periodo_mes` (date, uso primer día del mes) para identificar año/mes.
   - `fecha_programada` (date) calculada con periodicidad + día de cobro.
   - `fecha_limite` (date) editable; default = último día del mes.
   - `monto_programado` (numeric) = prima anual / periodicidad.
   - `monto_pagado` (numeric, nullable).
   - `fecha_pago_real` (timestamp tz, nullable).
   - `estado` enum {`pendiente`, `pagado`, `vencido`, `omitido`}.
   - `notas` text, `created_by`, `updated_by`, `created_at`, `updated_at`.
2. **Campos nuevos en `polizas`**
   - `fecha_limite_pago` (date) visible en editor.
   - `periodicidad_pago` enum (mensual, trimestral, semestral, anual, personalizada).
   - `dia_pago_recurrente` (smallint) para alinear checkboxes.
3. **Vistas/funciones**
   - `fn_generar_pagos_programados(poliza_id uuid)` -> (periodos) usada por triggers.
   - `vw_agente_comision_mes_actual` con columnas: `agente_id`, `importe_programado`, `importe_pagado`, `importe_pendiente`.

## 3. Migraciones
1. Crear enum `poliza_pago_estado` y `poliza_periodicidad_pago`.
2. Alter `polizas` para nuevos campos (con defaults temporales).
3. Crear tabla `poliza_pagos_mensuales` + índices:
   - `UNIQUE(poliza_id, periodo_mes)`.
   - Índice por `estado` y `fecha_limite` para alertas.
4. Funciones:
   - `fn_generar_pagos_programados` (SQL/PLpgSQL) calcula periodos desde `fecha_emision` hasta fin de vigencia.
   - Trigger `trg_poliza_after_upsert` que vuelve a generar los periodos si cambian `prima_anual`, `periodicidad_pago`, `fecha_emision` o `fecha_limite_pago`.
5. Vista `vw_agente_comision_mes_actual` (usa tabla agentes/polizas + reglas de comisión existentes).

## 4. Backend / API
| Método | Ruta | Detalle |
| --- | --- | --- |
| GET | `/api/polizas/{id}/pagos` | Devuelve periodos ordenados con estados, montos y alertas calculadas (flag `isOverdue`, `isDueSoon`). |
| POST | `/api/polizas/{id}/pagos/{periodo}` | Marca un periodo como pagado o actualiza datos. Payload: `{ monto_pagado?, fecha_pago?, notas? }`. Valida default = `monto_programado`. |
| POST | `/api/polizas/{id}/pagos/generar` | Recalcula programados sin duplicar pagos ya registrados. Uso interno tras editar póliza. |
| GET | `/api/pagos/alertas?scope=asesor|supervisor` | Lista periodos `vencido` o `pendiente` con `fecha_limite <= hoy + 7`. |
| GET | `/api/agentes/{id}/comision-mes` | Resumen mes actual desde la vista `vw_agente_comision_mes_actual`. |

**Reglas**
- Al marcar pago: validar que periodo no esté cerrado; registrar usuario y timestamp.
- Calcular comisión del periodo = `monto_programado * porcentaje_comision` (usar porcentaje vigente por póliza/agente).
- API debe emitir evento/auditoría para historial.

## 5. Jobs / alertas
- Script diario (cron) que:
  1. Marca `vencido` todo periodo `estado = 'pendiente'` con `fecha_limite < current_date`.
  2. Encola notificaciones (correo/in-app) para asesores y supervisores.
- Endpoint para dashboard debe cachearse (revalidate cada hora) usando Supabase cache tables o Redis (si disponible).

## 6. Front-end
### Clientes / Pólizas (asesor)
1. **Formulario:**
   - Agregar campos “Fecha límite de pago”, “Periodicidad”, “Día de pago”.
   - Validar consistencia y mostrar preview de mensualidad.
2. **Sección nueva “Pagos programados”**
   - Tabla por meses (solo los generados). Columnas: `Mes`, `Monto programado`, `Estado`, `Acciones`.
   - Checkbox o botón “Marcar pagado” abre modal:
     - Inputs: `Monto pagado` (default = mensualidad), `Fecha de pago`, `Notas`.
3. **Alertas visuales**
   - Badge rojo = vencido, ámbar = próximo, verde = pagado.
   - Banner en detalle de cliente cuando existan pagos vencidos.
4. **Dashboard asesor**
   - Widget “Pagos pendientes” con conteo y enlaces directos a pólizas.

### Vista Supervisores
- En cada acordeón de agente, badge “Comisión mes actual: $X (pagado Y / pendiente Z)”.
- Tooltip o modal con desglose por póliza.
- Sección “Alertas del equipo” listando pagos vencidos.

## 7. QA y checklist
1. **Migraciones**: correr en dev + seed casos con distintas periodicidades.
2. **API tests**: unitarios para generación de periodos, registro de pagos, alertas.
3. **UI tests**: flujo marcar pago, validación de default, indicadores de estado.
4. **Cron**: simular fecha futura para validar cambio `pendiente -> vencido`.
5. **Supervisores**: snapshot del badge con datos mock.
6. **Accesibilidad**: etiquetas de color acompañadas de texto.
7. **Docs**: actualizar README de scripts y cron jobs.
