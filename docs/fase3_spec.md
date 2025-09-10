# Fase 3 – Sprint 0 (Especificación Base)

Estado: BORRADOR – completar decisiones marcadas como TODO.
Fecha: 2025-09-06

## 1. Objetivo Sprint 0
Definir reglas de negocio inmutables y modelo de datos base antes de crear migraciones. Salida: este documento validado + lista cerrada de enums, cálculos y flujos de aprobación.

## 2. Roles y Accesos (Conceptual)
- asesor (vista “Asesor” = Agentes): Lee sus clientes y pólizas; propone cambios de datos cliente (solicitud). No modifica directamente.
- supervisor (promotoría): Ve todos los clientes/pólizas de su ámbito; aprueba/rechaza solicitudes.
- super_usuario (vista “Promotoría”): Parametriza productos (nuevas variantes), actualiza tabla días/mes, carga manual UDI / FX (solo si fallback), puede revertir aprobaciones (excepción).

RLS (más adelante): SELECT filtrado por propietario/ámbito; INSERT limitado según rol; UPDATE casi siempre vía funciones seguras.

## 3. Enumeraciones / Catálogos
| Nombre | Valores | Notas |
|--------|---------|-------|
| estatus_poliza | EN_VIGOR, ANULADA | Solo 2 (comentarios Word). |
| forma_pago | MODO_DIRECTO, CARGO_AUTOMATICO | Comentarios Word. |
| tipo_producto | VI, GMM (extensible) | Factores puntos distintos. |
| tipo_cambio_cliente (historial) | CREACION, MODIFICACION, APROBACION, RECHAZO | Para auditoría. |
| estado_solicitud_cambio | PENDIENTE, APROBADA, RECHAZADA | Decisión: NO habrá caducidad automática. |
| moneda_poliza | MXN, USD, UDI | Moneda en la que usuario captura prima / SA. |
| tipo_clasificacion_puntos | CERO, MEDIO, SIMPLE, DOBLE, TRIPLE | Resultado cálculo puntos. |

## 4. Reglas de Normalización
- Textos nombre_comercial y nombres contratante / nombres separados en MAYÚSCULAS (trigger BEFORE INSERT/UPDATE).
- Separador de miles solo en UI; almacenar enteros/numéricos sin formato.
- Emails lower-case trim.
- Nombre completo del cliente se compone (primer_nombre, segundo_nombre?, primer_apellido, segundo_apellido) y se genera columna derivada full_name_normalizado para búsquedas.

### 4.1 Campos de Nombre (Decisión)
Campos:
- primer_nombre (NOT NULL)
- segundo_nombre (NULLABLE)
- primer_apellido (NOT NULL)
- segundo_apellido (NOT NULL) *El usuario requiere ambos apellidos.*

Validaciones:
- Al menos 3 componentes obligatorios (primer_nombre, primer_apellido, segundo_apellido).
- full_name_normalizado = UPPER(concatenación con espacios simples) sin dobles espacios.

Nota: si en el futuro se permite ausencia de segundo_apellido bastará con permitir NULL y ajustar validación.

## 5. Puntos / Conteos
Reglas confirmadas:
- Producto GMM: siempre 0.5 puntos por póliza (independiente prima) – comentario Word.
- Producto VI: puntos enteros (sin medios). Fórmula base = factor_año (ver factores producto) * factor_producto (si se requiere). TODO: Definir si prima mínima afecta puntos.
Conteo / Conteo2: campos internos calculados; NO visibles en UI. Se mantienen en caché (tabla poliza_puntos_cache) o se recalculan on-demand.
 AÑO 11+: factor abierto (year_from=11, year_to=NULL en producto_factores).

Prima Anual: campo de entrada MANUAL provisto por el usuario (no derivado). Los cambios generan historial_costos_poliza.

Nota: Se descarta explícitamente cualquier umbral de reducción de prima en Fase 3 (decisión negocio). Si en el futuro se requiere, podrá añadirse como regla parametrizada sin alterar el modelo actual.

### 5.1 Reglas definitivas de puntos por PRIMA (aporta imagen "CONTEO / PRIMAS")
Clasificación y puntos dependen de tipo de producto y rango de prima ANUAL (moneda base; si existen varias monedas se convertirá previamente a MXN / UDI según estándar antes de evaluar rangos – PENDIENTE definir conversión).

#### Vida (VI)
| Rango prima (inclusive) | Clasificación | Puntos |
|-------------------------|--------------|--------|
| 0  – 14,999             | CERO         | 0      |
| 15,000 – 49,999         | SIMPLE       | 1      |
| 50,000 – 149,999        | DOBLE        | 2      |
| 150,000 o más           | TRIPLE       | 3      |

#### Gastos Médicos (GMM / GM)
| Rango prima (inclusive) | Clasificación | Puntos |
|-------------------------|--------------|--------|
| 0 – 7,499.99            | CERO         | 0      |
| ≥ 7,500                 | MEDIO        | 0.5    |

Notas:
- Se cambia la lógica previa (GMM siempre 0.5) incorporando el umbral 7,500; debajo de este valor la póliza no suma puntos.
- "MEDIO" sólo aplica a GMM; para VI no existe medio punto.
- Los multiplicadores simple/doble/triple ya NO dependen de un campo puntos_multiplicador externo sino que se derivan directamente del rango; se elimina necesidad de puntos_multiplicador en productos para cálculo de puntos (puede mantenerse si se desea para otro propósito, pero no es requerido para el conteo actual).

#### Enumeración adicional sugerida
tipo_clasificacion_puntos: CERO, MEDIO, SIMPLE, DOBLE, TRIPLE

#### Función de cálculo (borrador)
```
CASE tipo_producto
  WHEN 'GMM' THEN CASE 
    WHEN prima_anual >= 7500 THEN (0.5, 'MEDIO')
    ELSE (0, 'CERO')
  END
  WHEN 'VI' THEN CASE 
    WHEN prima_anual >= 150000 THEN (3, 'TRIPLE')
    WHEN prima_anual >= 50000 THEN (2, 'DOBLE')
    WHEN prima_anual >= 15000 THEN (1, 'SIMPLE')
    ELSE (0, 'CERO')
  END
END
```

La función `recalc_puntos_poliza` adoptará esta lógica y almacenará:
- puntos_total
- clasificacion (enum)
- prima_anual_snapshot
- year_factor (para auditoría, aunque no interviene en puntos actuales)
- base_factor (porcentaje año producto del apartado 6) para correlación futura.

#### Consideraciones de extensión futura
- Si se agregan otros productos (p.ej. con medio punto distinto) se añade otro branch.
- Si la prima cambia de moneda se normaliza antes (crear función normalize_prima(prima, moneda)).
- Si se requieren sub-rangos dinámicos, se puede materializar tabla `prima_puntos_reglas(tipo_producto, min_prima, max_prima, puntos, clasificacion)` y ejecutar una consulta ORDER BY min_prima DESC LIMIT 1.

## 6. Productos Parametrizados (Columnas rígidas AÑO 1 .. AÑO 11+)
Requisito de negocio: mantener exactamente las columnas visibles del Excel (AÑO 1, AÑO 2, … AÑO 10, AÑO 11+) para cada variante de producto.

### 6.1 Modelo propuesto (actualizado)
```
producto_parametros (
  id uuid pk,
  nombre_comercial text not null,
  tipo_producto tipo_producto_enum not null,        -- VI | GMM
  moneda moneda_poliza null,                        -- si variante aplica solo a una moneda; NULL = indiferente
  duracion_anios int null,                          -- puede ser NULL si no aplica (ej. Se Adapta)
  condicion_sa_tipo text null,                      -- '<', '>=', '<=', '>', '=' o 'RANGO'
  sa_min numeric(18,2) null,
  sa_max numeric(18,2) null,
  condicion_edad_tipo text null,                    -- '<=', '>=', 'RANGO'
  edad_min int null,
  edad_max int null,
  anio_1_percent numeric(6,3) null,
  anio_2_percent numeric(6,3) null,
  anio_3_percent numeric(6,3) null,
  anio_4_percent numeric(6,3) null,
  anio_5_percent numeric(6,3) null,
  anio_6_percent numeric(6,3) null,
  anio_7_percent numeric(6,3) null,
  anio_8_percent numeric(6,3) null,
  anio_9_percent numeric(6,3) null,
  anio_10_percent numeric(6,3) null,
  anio_11_plus_percent numeric(6,3) null,
  puntos_multiplicador int not null default 1,      -- reservado futura lógica
  activo boolean default true,
  creado_por uuid null,
  creado_at timestamptz default now(),
  unique(nombre_comercial, coalesce(moneda::text,''), coalesce(duracion_anios,-1), coalesce(condicion_sa_tipo,''), coalesce(sa_min,-1), coalesce(sa_max,-1), coalesce(condicion_edad_tipo,''), coalesce(edad_min,-1), coalesce(edad_max,-1))
)
```
Notas:
- Cada fila = variante (ej. STAR Temporal 10P <0.5 - USD / >=0.5).
- No se usan effective_from/effective_to; cambios → nueva fila (opcional marcar activo=false anterior).
- Columnas porcentaje fijas reflejan Excel.

### 6.2 Selección de variante
1. Filtrar por nombre_comercial y tipo_producto.
2. Filtrar por moneda = prima_moneda de la póliza O variantes con moneda NULL.
3. Aplicar filtros SA según condicion_sa_tipo.
4. Aplicar filtros edad si procede.
5. Resolver empates: preferir mayor sa_min luego mayor edad_min (NULL al final).

### 6.3 Obtención de porcentaje por año
Calcular año_vigencia = número de aniversarios transcurridos + 1 (mínimo 1). Si año_vigencia >10 usar anio_11_plus_percent.

### 6.4 Ejemplos de mapeo
Row Excel: "STAR Temporal 20P <0.5 - USD" → nombre_comercial='STAR TEMPORAL 20P - USD', condicion_sa_tipo='<' sa_max=500000 duracion_anios=20.
Row Excel: "STAR Temporal USD 65 <=45" → condicion_edad_tipo='<=', edad_max=45.

### 6.5 Impacto
- Migraciones simples.
- Reportes replican columnas AÑO n directamente.
- Rigidez intencional (añadir año >11 implica ALTER TABLE).

### 6.6 Consideración futura
Si se requiriera agregar más años, se necesitaría ALTER TABLE.

---
## 6.8 Cálculo de Puntos (poliza_puntos_cache) – Integración con productos
Objetivo: derivar puntos de manera consistente y rápida.

Reglas actuales:
- GMM: siempre 0.5 puntos * puntos_multiplicador (normalmente 1).
- VI: puntos enteros = puntos_multiplicador (simple=1, doble=2, triple=3). (Definir exacta asignación simple/doble/triple; hoy placeholder via campo puntos_multiplicador en producto_parametros).

Los porcentajes (anio_X_percent) NO alteran los puntos directamente; representan otro indicador (ej. % comisión o distribución) que se almacena para referencia y potencial cálculos financieros.

### 6.9 Proceso cálculo cache
1. Determinar variante producto (sección 6.2).
2. Calcular año_vigencia.
3. Leer porcentaje_anual = columna correspondiente (para auditoría / futuras métricas); almacenar en cache como base_factor.
4. Determinar puntos_multiplicador de la variante.
5. Si tipo_producto=GMM → puntos_total = 0.5 * puntos_multiplicador.
  Si tipo_producto=VI → puntos_total = puntos_multiplicador.
6. Guardar snapshot en poliza_puntos_cache: (poliza_id, puntos_total, base_factor=porcentaje_anual, producto_parametro_id, year_factor=año_vigencia, breakdown jsonb con detalle).
7. Recalcular cuando: cambio prima (si afecta clasificación simple/doble/triple), cambio suma asegurada, cambio estado póliza, cambio de configuración producto (nueva vigencia effective_from), o corrección manual de clasificación.

  ### 6.9 Definición Tabla `polizas` (ACTUALIZADO)
  Esta sección reemplaza la numeración anterior (el proceso de cálculo cache se mantiene para referencia histórica hasta limpiar). Define estructura multi-moneda.

  ```
  polizas (
    id uuid primary key,
    cliente_id uuid not null references clientes(id) on delete cascade,
    producto_parametro_id uuid null references producto_parametros(id),
    numero_poliza text not null,
    estatus estatus_poliza not null default 'EN_VIGOR',
    fecha_emision date not null,
    fecha_alta_sistema timestamptz not null default now(),
    forma_pago forma_pago not null,
    prima_input numeric(14,2) not null,
    prima_moneda moneda_poliza not null,
    prima_mxn numeric(14,2) not null,
    sa_input numeric(18,2) null,
    sa_moneda moneda_poliza null,
    sa_mxn numeric(18,2) null,
    clasificacion_actual tipo_clasificacion_puntos null,
    puntos_actuales numeric(10,2) null,
    anulada_at timestamptz null,
    creado_por uuid null,
    creado_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(numero_poliza)
  )
  ```

  Triggers:
  - BEFORE INSERT/UPDATE: calcular prima_mxn (normalize_prima) y sa_mxn si sa_input no nulo.
  - AFTER INSERT y AFTER UPDATE (campos prima_input, prima_moneda, estatus, producto_parametro_id): recalc_puntos_poliza(id) actualiza cache y denormaliza clasificacion_actual/puntos_actuales.
  - BEFORE UPDATE: updated_at = now().

  Índices sugeridos (además de PK/UNIQUE):
  - idx_polizas_cliente_estado (cliente_id, estatus)
  - idx_polizas_producto (producto_parametro_id)

  RLS (conceptual):
  - SELECT: asesor sólo sus clientes, supervisor/super_usuario global.
  - UPDATE: sólo vía funciones seguras para campos sensibles.
  - INSERT: roles permitidos (asesor / supervisor / super_usuario según política).

  Notas:
  - producto_parametro_id se fija al crear; si cambia lógica comercial se puede recalcular y actualizar (guardando histórico sólo en cache, no se versiona poliza).
  - puntos_actuales es derivado; fuente autoritativa: poliza_puntos_cache.

  Migración: si tabla existe, ALTER TABLE ADD COLUMN para prima_input/prima_moneda/prima_mxn y demás; si no, crear completa.

### 6.10 Clasificación simple / doble / triple (PENDIENTE)
Se debe definir la lógica exacta de cuándo puntos_multiplicador =2 o =3. Opciones:
1. Basado en SA (rangos altos => 2 / 3).
2. Basado en prima_anual.
3. Mixto (mayor de clasificación por SA o Prima).
Mientras no se defina, puntos_multiplicador puede quedar en 1 para todas las variantes.

---

## 7. Calendario Pagos y Excepción Febrero
Regla: si dia_pago elegido > número de días del mes, se ajusta al máximo (28/29 Feb, 30 en meses de 30 días). Se marca flag fue_ajustado.
Tabla soporte:
- dias_mes(mes smallint, max_dias smallint, anio int NULL, es_bisiesto boolean, PRIMARY KEY (mes, anio NULLS FIRST))
Inicial: registros genéricos (mes=1..12) con max estándar; opcional sobre-escribir año bisiesto (mes=2, anio=2028, max_dias=29).

## 8. UDI (Unidad de Inversión)
Tabla:
- udi_values(fecha date PK, valor numeric(12,6), source text, fetched_at timestamptz, stale boolean)
Función planificada: get_current_udi(fecha) -> valor (fallback al más reciente anterior; marca stale si fecha < hoy). Job diario fetch serie Banxico SP68257 (token BANXICO_TOKEN). Guardar udi_valor_aplicado en cálculos dependientes (p.ej. pagos).

## 9. Historial y Auditoría
Tablas:
- cliente_historial(id, cliente_id, cambio_tipo, payload_old jsonb, payload_new jsonb, actor_id, creado_at)
- cliente_update_requests(id, cliente_id, solicitante_id, payload_propuesto jsonb, estado, motivo_rechazo text, creado_at, resuelto_at, resuelto_por)
- historial_costos_poliza(id, poliza_id, prima_anual_old, prima_anual_new, porcentaje_comision_old, porcentaje_comision_new, actor_id, creado_at)
- (posterior) poliza_pagos y poliza_puntos_cache

Triggers:
- Al aprobar solicitud -> inserta fila cliente_historial + actualiza cliente.
- Al cambiar prima / % comisión -> inserta historial_costos_poliza + recalcula puntos (invoca función). 

## 10. Reglas de Rechazo (BORRADOR)
Criterios potenciales (elegir / ajustar):
-- Eliminado: política de umbral de reducción de prima (no requerida en Fase 3).
2. Eliminación de campo obligatorio (correo / teléfono) quedando NULL.
3. Cambio repetido idéntico ya solicitado y pendiente.
4. Solicitud con fecha de nacimiento inválida / futura.
5. + (Agregar criterios específicos negocio) -> TODO

Se aplican automáticamente antes de pasar a PENDIENTE, o convierten en RECHAZADA con motivo.

## 11. Integridad / Constraints Planificados
- Unicidad cliente (Decisión): identificador secuencial propio formato LEACL-000000.
  - Implementación: secuencia PostgreSQL + función generar_cliente_code() que produce prefix 'LEACL-' || lpad(nextval('seq_cliente_code')::text,6,'0').
  - Columna cliente_code text UNIQUE NOT NULL.
  - Eliminamos dependencia de RFC (no se usa en el proyecto).
- Detección adicional de duplicados humanos: índice BTREE en (email_normalizado, primer_apellido, segundo_apellido).
- dias_mes unique(mes, anio) (anio NULL = default)
- udi_values PK(fecha)
- fx_values PK(fecha)
- producto_parametros UNIQUE (ver sección 6.1)

## 12. Funciones / Procedimientos (Especificación)
| Nombre | Resumen | Tipo |
|--------|---------|------|
| fn_normalize_text(text) | uppercase trim | SQL IMMUTABLE |
| get_current_udi(fecha) | retorna valor UDI aplicable | SQL/STABLE |
| recalc_puntos_poliza(poliza_id) | recalcula puntos y actualiza cache | plpgsql |
| recalc_puntos_poliza_batch(poliza_ids uuid[]) | versión batch para jobs | plpgsql |
| apply_cliente_update(request_id, actor_id) | valida y aplica solicitud | plpgsql |
| reject_cliente_update(request_id, actor_id, motivo) | marca rechazo | plpgsql |
| generar_cliente_code() | retorna siguiente LEACL-000000 | SQL/STABLE |

## 13. Seguridad de Datos
- RLS en clientes, polizas, cliente_update_requests, historial_costos_poliza.
- Políticas (ejemplo conceptual):
  - SELECT clientes: asesor WHERE clientes.asesor_id = auth.uid(); supervisor/super_usuario sin filtro.
  - INSERT cliente_update_requests: asesor dueño del cliente.
  - UPDATE clientes: solo vía función SECURITY DEFINER (aprobación).

## 14. Plan de Migraciones (Para Sprint 1)
Orden recomendado:
1. Nuevos ENUMs (estatus_poliza, forma_pago, tipo_producto, moneda_poliza, tipo_clasificacion_puntos, etc.).
2. Secuencia seq_cliente_code + función generar_cliente_code().
3. Tabla producto_parametros.
4. Tablas udi_values, fx_values, dias_mes (seed inicial Banxico + días estándar).
5. Tabla clientes (incluye cliente_code y nombres separados, prima_* campos si ya se definen aquí).
6. Tablas cliente_update_requests y cliente_historial.
7. Tabla historial_costos_poliza.
8. Tabla poliza_puntos_cache (vacía).
9. Funciones y triggers: normalización, get_current_udi, get_fx_usd, normalize_prima, recalc_puntos_poliza, apply/reject update.

## 15. Riesgos y Mitigación
| Riesgo | Mitigación |
|--------|------------|
| Cambios tardíos factores puntos | Parametrizar producto_factores; no hardcode. |
| API Banxico caída | Fallback último valor (stale=true) + alerta log. |
| Falta criterio rechazo claro | Mantener sección abierta hasta fin Sprint 0. |
| Identificador cliente ambiguo | Definir convención antes migraciones (RFC o combinación). |

## 16. Decisiones Pendientes (TODO)
| Ítem | Estado / Resolución |
|------|---------------------|
| Umbral reducción prima | NO APLICA: descartado por negocio en Fase 3. |
| Identificador único cliente | RESUELTO: código secuencial LEACL-000000 vía secuencia. |
| Factores producto VI | RESUELTO PARCIAL: sólo por año hoy; min_prima/max_prima reservados (NULL). |
| Expiración solicitud cambio | RESUELTO: no hay caducidad automática. |
| Campos obligatorios cliente | RESUELTO: primer_nombre, primer_apellido, segundo_apellido, telefono_celular, correo; (segundo_nombre opcional). |
| Tabla poliza_puntos_cache estructura | RESUELTO: incluir breakdown jsonb + valores snapshot (ver sección 18). |
| RFC | RESUELTO: no se usa ni almacena. |

## 17. Aceptación Sprint 0
Se considera completado cuando:
- Este documento revisado y marcado como "APROBADO" (añadir sección de firmas/fecha).
- Todas las filas de Decisiones Pendientes tienen respuesta o un plan fechado.
- No se agregan nuevas tablas fuera del listado planificado.

## 18. Próximos Pasos Tras Aprobación
- Generar archivo SQL de migraciones iniciales (Sprint 1).
- Implementar funciones utilitarias (normalización, get_current_udi).
- Preparar script fetch UDI.

---
**Acción requerida:** Completar la sección 16 (Decisiones Pendientes). Añadir respuestas aquí y notificar para avanzar a migraciones.
---

## 18.1 poliza_puntos_cache (Detalle) (ACTUALIZADO)
Uso: evitar recomputar puntos y auditar factores (prima normalizada, porcentajes, tasas FX/UDI).
Propuesta estructura:
```
poliza_puntos_cache (
  poliza_id uuid primary key references polizas(id) on delete cascade,
  puntos_total numeric(10,2) not null,
  clasificacion tipo_clasificacion_puntos not null,
  base_factor numeric(10,4) null,          -- porcentaje anual encontrado (anio_X_percent)
  producto_factor numeric(10,4) null,      -- reservado futuro
  year_factor int null,                    -- año de vigencia usado
  prima_anual_snapshot numeric(14,2) null, -- prima_mxn al momento cálculo
  producto_parametro_id uuid null references producto_parametros(id),
  udi_valor numeric(12,6) null,            -- tasa UDI usada (si aplica)
  usd_fx numeric(12,6) null,               -- tipo cambio USD usado (si aplica)
  breakdown jsonb null,                    -- {"fx_usd":17.1234,"udi":7.456789,"formula":"..."}
  recalculo_reason text null,
  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```
Trigger BEFORE UPDATE para refrescar updated_at.
Recalculo disparadores: cambio prima_input / prima_moneda, cambio estado póliza relevante, variante producto inactivada/ sustituida, job batch manual.

## 18.2 Ejemplo breakdown jsonb
```
{
  "year": 3,
  "factor_base": 1.25,
  "producto": "VI",
  "producto_version": 4,
  "min_prima_aplicada": null,
  "max_prima_aplicada": null,
  "regla_gmm": false,
  "formula": "factor_base (1.25) * 1 = 1.25"
}
```

## 18.3 Generador Código Cliente
Secuencia: `CREATE SEQUENCE seq_cliente_code;`
Función:
```
CREATE OR REPLACE FUNCTION generar_cliente_code() RETURNS text AS $$
  SELECT 'LEACL-' || lpad(nextval('seq_cliente_code')::text, 6, '0');
$$ LANGUAGE sql VOLATILE;
```
Uso en INSERT clientes: `cliente_code default generar_cliente_code()`.

## 18.4 producto_factores (Uso en cálculo)
Selección: se toma la fila con year_from <= año_vigencia AND (year_to IS NULL OR year_to >= año_vigencia)
AND ( (min_prima IS NULL OR prima_anual >= min_prima) AND (max_prima IS NULL OR prima_anual < max_prima) )
ORDER BY year_from DESC, min_prima NULLS FIRST LIMIT 1.

Hoy min_prima/max_prima son NULL (ignorados), lo que simplifica a búsqueda por año.

---

## Anexo: Resumen de Alcances y Reglas (Fase 3)

Este anexo resume el alcance funcional y las reglas/validaciones clave definidas para Fase 3.

### Alcance
- Unicidad y normalización de clientes con código propio: LEACL-000000.
- Flujo de aprobación de cambios a datos de cliente (asesor solicita, supervisor aprueba/rechaza) con auditoría completa.
- Parametrización de productos en `producto_parametros` con columnas rígidas AÑO 1..10 y AÑO 11+ por variante (sin vigencias efectivas; nuevas variantes = nuevas filas).
- Soporte multi‑moneda en pólizas (MXN/USD/UDI) y normalización de primas a MXN para cálculos.
- Cálculo de puntos por póliza (VI/GMM) basado en rangos de prima en MXN; almacenamiento en cache (`poliza_puntos_cache`).
- Fuentes de UDI/FX (Banxico) con fallback al último valor y marca stale.
- Calendario de pagos con ajuste por días del mes (incluye Febrero).
- Reporte diario de cambios en prospectos con un solo adjunto XLSX que contiene dos hojas: “Cambios” y “Usuarios – Última conexión (CDMX)”, usando Auth (last_sign_in_at) y formateo CDMX.
- Políticas RLS y funciones seguras para mutaciones sensibles.

### Reglas y validaciones
- Clientes
  - Obligatorios: primer_nombre, primer_apellido, segundo_apellido, teléfono, correo.
  - Normalización: nombres en MAYÚSCULAS; email en minúsculas/trim; `full_name_normalizado` para búsquedas.
  - Código secuencial único LEACL-000000; RFC no se usa.
- Productos (`producto_parametros`)
  - Columnas fijas anio_1_percent..anio_11_plus_percent.
  - Variantes por nombre, tipo, moneda opcional, y condiciones por SA/edad.
  - Selección: nombre+tipo+(moneda=de póliza o NULL)+filtros SA/edad; empates: mayor sa_min y mayor edad_min.
- Pólizas
  - Captura: prima_input + prima_moneda; opcional SA con su moneda.
  - Derivados: prima_mxn (trigger normalize_prima) y opcional sa_mxn.
  - Denormalización ligera: clasificacion_actual, puntos_actuales; autoridad en `poliza_puntos_cache`.
  - Validaciones: montos ≥ 0; monedas válidas; estatus en enum.
- Puntos (en MXN)
  - VI: <15,000→0; 15,000–49,999→1; 50,000–149,999→2; ≥150,000→3.
  - GMM: <7,500→0; ≥7,500→0.5.
  - Porcentajes por año (producto) se guardan como base_factor (auditoría), no afectan puntos.
  - Año de vigencia: aniversarios+1; >10 usa AÑO 11+.
- Auditoría y aprobación
  - `cliente_update_requests`, `cliente_historial`, `historial_costos_poliza`, `poliza_puntos_cache` con breakdown y tasas aplicadas.
- Calendario de pagos
  - Ajuste del día al máximo del mes; flag de ajuste.
- UDI/FX
  - `udi_values` y `fx_values` con funciones `get_current_udi` y `get_fx_usd` y fallback al último valor ≤ fecha.
- Seguridad/RLS
  - Asesor ve sus clientes/pólizas; supervisor y super_usuario sin filtro.
  - UPDATE sensible sólo vía funciones SECURITY DEFINER; triggers para normalización/derivados.
- Reportes
  - Diario de prospectos (HTML + un solo XLSX con 2 hojas: “Cambios” y “Usuarios – Última conexión (CDMX)”) desde Auth.

### Notas de zona horaria
- Almacenaje de timestamps en UTC; visualización y reportes en America/Mexico_City (CDMX).

## Sprint 5 – Reporte diario (Criterios de Aceptación)

- Entrega: un único archivo XLSX con 2 hojas: "Cambios" y "Usuarios – Última conexión (CDMX)".
- Canales: envío por correo (HTML + adjunto) en ejecución programada diaria y ejecución manual.
- Autenticación: admite ejecución por cron con secreto y por sesión de usuario autorizado.
- Ventana por defecto: día CDMX; soporta modos last24h y rango explícito. "Cambios" siempre se genera; "Usuarios – Última conexión" se puebla desde Auth (last_sign_in_at).
- Comportamiento sin datos: el archivo se envía igualmente con hojas vacías salvo que se especifique 'skipIfEmpty' donde aplique.

---

## Sprint 2 – Monedas y normalización (estado: Completado)

Entregables implementados:
- Funciones `get_current_udi(fecha)`, `get_fx_usd(fecha)`, `normalize_prima(monto, moneda, fecha)` y trigger BEFORE en `polizas` para mantener `prima_mxn` y `sa_mxn`.
- Seeds mínimos para la fecha actual en `udi_values` y `fx_values`.
- Endpoints admin de mercado:
  - GET/POST `/api/market/udi` (listar y upsert por fecha)
  - GET/POST `/api/market/fx` (listar y upsert por fecha)
  - Permisos POST restringidos a `admin | supervisor | super_usuario | superusuario`.

RLS:
- Políticas aplicadas: lectura para `authenticated`; escritura sólo para roles superiores (admin/supervisor/superusuario). Ver migración `20250909_fase3_sprint2_rls_policies.sql`.

Operación (post-merge / despliegue):
- Configurar Cron en la plataforma (p.ej. Vercel) apuntando a `/api/market/sync` con header `x-cron-secret: $MARKET_SYNC_SECRET` y definir variables `MARKET_SYNC_SECRET` y `BANXICO_TOKEN` en el entorno.
- (Opcional) Crear una UI mínima de carga manual (ya disponible vía endpoints POST autenticados).

Notas de uso rápido:
- Upsert manual UDI/FX: enviar POST autenticado a `/api/market/udi` o `/api/market/fx` con cuerpo `{ fecha: 'YYYY-MM-DD', valor: number, source?: string, stale?: boolean }`.

---

## Sprint 3 – Puntos y caché (estado: Completado)

Entregables implementados:
- Función `recalc_puntos_poliza(poliza_id)` con reglas de puntos por rangos (VI y GMM) usando `prima_mxn`.
- Snapshot en `poliza_puntos_cache` con:
  - `puntos_total`, `clasificacion`, `base_factor` (porcentaje por año del producto), `year_factor`, `producto_parametro_id`.
  - Tasas aplicadas: `udi_valor`, `usd_fx` y `breakdown` con `prima_mxn`, `sa_mxn`, `fx_aplicado`, `udi_aplicada`.
- Triggers AFTER en `polizas` que recalculan al cambiar: `prima_input`, `prima_moneda`, `sa_input`, `sa_moneda`, `fecha_emision`, `estatus`, `producto_parametro_id`.
- Auto-selección de variante (`producto_parametro_id`) cuando venga NULL: prioriza coincidencia de moneda y rango de SA.
- Recalculo masivo: `recalc_puntos_poliza_all(p_limit int default null)`.
- Integración operativa: el endpoint `/api/market/sync` (Banxico) dispara recálculo dirigido por fecha y moneda tras upsert de UDI/FX.

Notas:
- Si no existe variante aplicable, se deja `producto_parametro_id` NULL y la clasificación puede resultar NULL.
- Para resultados consistentes, mantener UDI/FX del día cargados (cron de mercado activo).
