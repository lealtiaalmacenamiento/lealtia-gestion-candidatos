# Lógica de negocio — Lealtia Gestión de Candidatos

Este documento consolida la lógica de negocio vigente en la aplicación (UI + API + reglas de datos) basada en el código actual. Cubre: autenticación/roles, candidatos, consulta/eliminados, usuarios, parámetros, auditoría, prospectos, planificación y utilidades de fechas/proceso.

## Autenticación y roles
- Obtención de sesión vía Supabase SSR (`getUsuarioSesion`).
- Tras autenticación, se busca en tabla `usuarios` (email); si no existe se devuelve rol null/activo=false.
- Roles válidos: `admin`, `editor`, `superusuario`, `lector`, `agente` (fase 2).
- Restricciones clave:
  - `agente` sólo puede operar sobre sus datos (prospectos/planificación), y su `agente_id` se fuerza desde sesión.
  - Superusuario/Admin pueden listar/seleccionar agentes y operar sobre terceros.

## Auditoría
- `logAccion(accion, {usuario, tabla_afectada, id_registro, snapshot})` inserta en `RegistroAcciones` y fallback `registro_acciones`.
- No registra en entornos Edge; tolera fallos sin romper flujo.

## Candidatos
- Alta (`POST /api/candidatos`):
  - Requiere sesión activa.
  - Campos mínimos: `candidato`, `mes`, `efc`.
  - Autocompleta fechas/rangos desde catálogos `cedula_a1` y `efc` por `mes`/`efc`.
  - Valida unicidad de `ct` si viene informado (no eliminado).
  - Recalcula `proceso` y `dias_desde_ct` en backend con `calcularDerivados`.
  - Normaliza campos de fecha; inserta `usuario_creador`.
  - Si `email_agente` válido: intenta crear usuario rol `agente` (`crearUsuarioAgenteAuto`), adjunta meta informativa.
  - Registra `alta_candidato` en auditoría.
- Edición (`PUT /api/candidatos/[id]`):
  - Requiere usuario activo.
  - Valida cambio de `ct` (unicidad entre no eliminados, excluyendo el propio).
  - Si llega `email_agente` y no existía previamente, intenta creación auto del usuario agente; luego guarda `email_agente` (no se permite cambiarlo después).
  - Si cambian `mes`/`efc`, reautocompleta campos derivados de catálogos.
  - `etapas_completadas` (JSON): merge con metadatos `completed/by/at` del usuario en sesión. Se registra `etapa_desmarcada` si llega `_etapa_uncheck` con motivo.
  - Setea `usuario_que_actualizo`, `ultima_actualizacion` y recalcula `proceso`. Normaliza fechas.
  - Registra `edicion_candidato` con snapshot previo.
- Borrado lógico (`DELETE /api/candidatos/[id]`):
  - Marca `eliminado=true`, `fecha_eliminacion` y `usuario_que_actualizo`.
  - Registra `borrado_logico_candidato`.
- Listado/consulta (`GET /api/candidatos`):
  - Filtro `eliminados=1` para ver eliminados.
  - Búsqueda rápida por `ct` (no eliminado).

## Usuarios
- Listado (`GET /api/usuarios`): usa cliente admin (service role). Requiere configuración correcta del service role.
- Alta (`POST /api/usuarios`):
  - Valida rol contra la lista permitida.
  - Password: puede generarse temporal; valida fortaleza (>=8, may/min/dígito).
  - Unicidad `email` en tabla `usuarios`.
  - Crea usuario en Supabase Auth (email confirmado) y luego inserta fila en `usuarios` con `must_change_password=true` e `id_auth`.
  - Enviar correo con password temporal si se solicitó.
  - Registra `alta_usuario`.

## Parámetros (catálogos y metas)
- Editables en UI para `cedula_a1` y `efc` (rangos y fechas de procesos) y metas Fase 2 (e.g., meta semanal de citas).
- Cambios requieren confirmación y se registran en auditoría desde el cliente.
- Estos catálogos alimentan autocompletado en altas/ediciones de candidatos y cálculo de proceso.

## Prospectos
- Listado/filtrado (`GET /api/prospectos`):
  - Restringe por rol: agente sólo ve los suyos; superuser puede forzar `agente_id`.
  - Filtros: `anio`, `semana`, `id`, `estado`, `solo_con_cita`, `solo_sin_cita`.
  - Semana: incluye registros con `semana_iso/anio` o con `fecha_cita` dentro del rango de esa semana.
- Alta (`POST /api/prospectos`):
  - Requiere sesión activa; asigna `agente_id` del usuario.
  - Normaliza `fecha_cita`: acepta ISO UTC, `YYYY-MM-DD`, o `YYYY-MM-DDTHH:mm` (convierte a UTC sumando 6h MX).
  - Valida: hora cerrada (min=00) y no solapar otra cita del mismo agente en esa hora.
  - Estado por defecto `pendiente` (o el válido enviado).
- Edición (`PATCH /api/prospectos/[id]`):
  - Restringe propiedad si rol `agente` (sólo sus registros).
  - Permite actualizar `nombre`, `telefono`, `notas`, `estado` y `fecha_cita` con la misma normalización/validaciones.
  - Evita solapes en la misma hora (excluye el propio ID al validar).
- Borrado (`DELETE /api/prospectos/[id]`):
  - Restringe a propietario si `agente`.

## Planificación semanal
- Vista editable por semana ISO (1–53) y año. Modo "Todo el año" es informativo.
- Roles: agente edita su plan; superusuario selecciona agente.
- Bloques por celda (day 0–6, hour 'HH'): `PROSPECCION`, `CITAS`, `SMNYL`.
  - Notas obligatorias en `PROSPECCION` y `SMNYL`.
  - `CITAS`: puede vincular prospecto (opcional). Si no hay prospecto, notas obligatorias.
- Citas automáticas:
  - La UI integra como bloques `origin='auto'` las citas provenientes de `/api/prospectos/citas` en la semana.
  - Edición de un bloque `CITAS` dispara sincronización inmediata con prospectos: asigna/mueve/quita `fecha_cita` y estado (`con_cita`/`pendiente`).
- Guardado (`POST /api/planificacion`):
  - Persiste sólo bloques `origin!='auto'` (manuales). Opción "Congelar citas auto" permite incluir autos como snapshot.
  - Prima anual promedio y % comisión se guardan; UI calcula ganancia estimada y progreso contra meta semanal de citas.
- GET (`/api/planificacion`): devuelve plan del agente/semana/año o defaults (sin bloques); para agentes, fuerza su `agente_id` de sesión.
- Realtime/auto-refresh: suscripción a cambios en `prospectos`; intervalo 60s; BroadcastChannel para sincronía cross-tab.
- Edición en pasado: bloqueada; celdas pasadas se deshabilitan.
- Endpoint `POST /api/planificacion/remove_cita`: elimina de una planificación persistida bloques auto de un prospecto (no usado por la UI por defecto).

## Consulta y eliminados (candidatos)
- Consulta lista candidatos no eliminados; exportaciones (PDF/Excel) y filtros desde UI.
- Vista de eliminados muestra soft-deletes.
- Cambios de etapas_json en candidatos registran auditoría con motivo cuando se desmarca.

## Utilidades clave
- `proceso.ts`:
  - Parsers de fechas/rangos robustos en español (dd/mm/aaaa, yyyy-mm-dd, "1 al 5 sep", etc.).
  - Deriva etapa del proceso según "hoy" y calcula `dias_desde_ct`.
  - Versiones con "anchor" para resolver rangos sin año tomando un mes/año de referencia.
- `semanaIso.ts`:
  - Utilidades para obtener semana ISO, formar rangos de fechas de la semana y formatear etiqueta.

## reglas transversales
- Manejo estricto de zonas horarias: la UI asume MX con offset fijo -06 para calcular ISO de citas; la API normaliza a UTC; revisar DST.
- Auditoría: acciones de alta/edición/borrado de candidatos y alta de usuarios; recomendable extender a planificación/prospectos.
- Seguridad: endpoints validan sesión; rol `agente` restringe datos a su propiedad; rutas admin usan service role.

## mejoras sugeridas
- Planificación: evitar asignar el mismo prospecto a múltiples celdas en la semana (validación UI/API).
- Zona horaria: introducir librería con TZ (Temporal/Luxon) y parametrizar América/México_City para DST.
- Auditoría extendida: registrar cambios de planificación y sincronizaciones de citas.
- Concurrencia: resolver conflictos de edición en planificación con detección de versión/updated_at.
- Herramientas de productividad: copiar semana, limpiar semana, mover citas entre semanas.
- Parámetros: versionar cambios y mostrar histórico.
