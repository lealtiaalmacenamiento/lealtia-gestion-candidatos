# Fase 6 - Embudo de Candidatos y Alertas de Vencimiento

## Objetivo

Agregar visualizaciones gráficas en la consulta de candidatos para supervisores:
1. **Embudo de candidatos**: Mostrar visualmente la cantidad de candidatos en cada fase del proceso
2. **Alertas de vencimiento**: Destacar candidatos con fechas próximas a vencer sin completar

## 1. Embudo Visual de Candidatos

### Descripción
Componente tipo funnel que muestra:
- Cantidad de candidatos en cada fase del proceso
- Representación visual proporcional (ancho según cantidad)
- Interactivo: al hacer click filtra la tabla de candidatos
- Muestra tasa de conversión del embudo completo

### Fases del embudo (orden secuencial)
1. **Prospección** - Candidatos iniciados (fecha_creacion_pop o fecha_creacion_ct)
2. **Registro y envío** - periodo_para_registro_y_envio_de_documentos
3. **Capacitación A1** - capacitacion_cedula_a1
4. **Examen** - fecha_tentativa_de_examen
5. **Folio OV** - periodo_para_ingresar_folio_oficina_virtual
6. **Playbook** - periodo_para_playbook
7. **Pre-escuela** - pre_escuela_sesion_unica_de_arranque
8. **Currícula CDP** - fecha_limite_para_presentar_curricula_cdp
9. **Escuela Fundamental** - inicio_escuela_fundamental

### Lógica de asignación de fase actual
Un candidato está en una fase si:
- Tiene fecha asignada para esa fase
- La fecha de la fase está **en el futuro** o **es hoy** (fecha >= hoy)
- O bien, la fase anterior está completada pero esta NO

Se toma la **primera fase** que cumpla estas condiciones como "fase actual".

### Cálculos
- **Cantidad por fase**: Contar candidatos cuya fase actual sea esa
- **% Conversión**: (Candidatos en última fase / Candidatos en primera fase) × 100
- **Ancho visual**: Proporcional a la cantidad (100% para la fase con más candidatos)

### Interacción
- Click en cualquier barra del embudo → filtra la tabla para mostrar solo candidatos de esa fase
- Barra activa se destaca visualmente
- Botón "Limpiar filtro" para mostrar todos nuevamente

### Diseño visual
```
┌──────────────────────────────────────────────┐
│  📊 EMBUDO DE CANDIDATOS                     │
│  Actualizado: 10 de diciembre de 2025        │
├──────────────────────────────────────────────┤
│                                              │
│  ████████████████████████████ Prospección 45 │
│    ████████████████████ Registro 32          │
│      ████████████████ Capacitación A1 28     │
│        ████████ Examen 12                    │
│          █████ Folio OV 8                    │
│            ███ Playbook 5                    │
│             ██ Pre-escuela 3                 │
│              █ Currícula CDP 2               │
│              █ Escuela Fundamental 1         │
│                                              │
│  Tasa de conversión: 2.2% (1/45)             │
└──────────────────────────────────────────────┘
```

Colores según PHASE_CALENDAR_THEME definidos en candidatePhases.ts

## 2. Alertas de Vencimiento

### Descripción
Componente que muestra candidatos con fechas próximas a vencer sin marcar como completados.

### Criterios de alerta
Un candidato aparece en alertas si:
- Tiene una fase con fecha asignada
- La fecha está **dentro de los próximos 14 días** (o ya venció)
- La fase **NO está marcada como completada** en `etapas_completadas`
- Excluye: `fecha_tentativa_de_examen` (no tiene checkbox de completado)

### Niveles de urgencia
- **Crítico** (Rojo): Fecha vencida (fecha < hoy)
- **Urgente** (Naranja): Vence en 1-3 días
- **Atención** (Amarillo): Vence en 4-7 días
- **Próximo** (Azul): Vence en 8-14 días

### Información mostrada
Para cada alerta:
- Nombre del candidato
- Fase pendiente
- Fecha límite
- Días restantes (o "Vencido hace X días")
- Nivel de urgencia (color)
- Link rápido a ficha del candidato

### Ordenamiento
1. Por urgencia (crítico → urgente → próximo)
2. Por fecha (más urgente primero)

### Diseño visual
```
┌─────────────────────────────────────────────┐
│  ⚠️ ALERTAS DE VENCIMIENTO                  │
│  Próximos 14 días                           │
├─────────────────────────────────────────────┤
│                                             │
│  🔴 María González                          │
│     Registro y envío - Vence: 08/12/2025   │
│     ⏰ Vencido hace 2 días                  │
│     [Ver ficha →]                           │
│                                             │
│  🟠 Juan Pérez                              │
│     Capacitación A1 - Vence: 11/12/2025    │
│     ⏰ Vence en 1 día                       │
│     [Ver ficha →]                           │
│                                             │
│  🟡 Ana Martínez                            │
│     Playbook - Vence: 15/12/2025           │
│     ⏰ Vence en 5 días                      │
│     [Ver ficha →]                           │
│                                             │
│  🔵 Carlos Rodríguez                        │
│     Pre-escuela - Vence: 20/12/2025        │
│     ⏰ Vence en 10 días                     │
│     [Ver ficha →]                           │
│                                             │
│  Sin alertas adicionales                    │
└─────────────────────────────────────────────┘
```

## 3. Ubicación en la interfaz

### Página: `/candidatos` (Consulta de candidatos)

Layout propuesto:
```
┌─────────────────────────────────────────────────┐
│  CONSULTA DE CANDIDATOS                         │
├─────────────────────────────────────────────────┤
│                                                 │
│  [Filtros existentes: rol, búsqueda, etc.]     │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────┐  ┌────────────────────┐   │
│  │ EMBUDO          │  │ ALERTAS            │   │
│  │ (2/3 ancho)     │  │ (1/3 ancho)        │   │
│  └─────────────────┘  └────────────────────┘   │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  TABLA DE CANDIDATOS                            │
│  (se filtra al hacer click en embudo)           │
│                                                 │
└─────────────────────────────────────────────────┘
```

## 4. Archivos a crear/modificar

### Nuevos archivos

**src/components/CandidateFunnel.tsx**
- Componente visual del embudo
- Props: candidatos[], onPhaseClick(phase)
- Calcula fase actual de cada candidato
- Renderiza barras clickeables

**src/components/CandidateAlerts.tsx**
- Componente de alertas de vencimiento
- Props: candidatos[]
- Calcula fechas pendientes dentro de 7 días
- Renderiza lista ordenada por urgencia

**src/lib/candidateFunnelUtils.ts**
- `getCurrentPhase(candidato)`: Determina fase actual
- `calculateFunnelData(candidatos[])`: Agrupa por fase
- `getPhaseAlerts(candidatos[])`: Extrae alertas de vencimiento
- `getDaysUntil(date)`: Calcula días restantes
- `getUrgencyLevel(days)`: Clasifica urgencia

### Archivos a modificar

**src/app/candidatos/page.tsx** (o ruta actual de consulta)
- Importar CandidateFunnel y CandidateAlerts
- Agregar estado para fase filtrada
- Filtrar candidatos según fase seleccionada
- Renderizar ambos componentes sobre la tabla

**src/lib/candidatePhases.ts**
- Exportar constante con orden de fases: `PHASE_ORDER: PhaseKey[]`
- Exportar mapeo de columnas a fases: `PHASE_FIELD_MAP`

## 5. Queries adicionales

No se requieren queries nuevas. Se utilizan los datos ya cargados de candidatos con todas sus columnas de fechas y `etapas_completadas`.

## 6. Responsividad

- **Desktop**: Embudo y alertas lado a lado
- **Tablet**: Embudo arriba (ancho completo), alertas abajo
- **Mobile**: Embudo colapsado (solo números), alertas en lista compacta

## 7. Permisos

Visible solo para roles:
- `superusuario`
- `supervisor`

Oculto para:
- `asesor`
- `desarrollador`

## 8. Testing

### Casos de prueba
1. Candidato en fase inicial (solo prospección)
2. Candidato en fase intermedia (A1 completa, examen pendiente)
3. Candidato en fase final (escuela fundamental)
4. Candidato con fecha vencida sin completar
5. Candidato con fecha próxima (3 días) sin completar
6. Candidato con todas las fases completadas
7. Click en barra del embudo → tabla se filtra correctamente
8. Múltiples alertas del mismo candidato (diferentes fases)

### Validaciones
- Fechas en formato correcto (ISO y texto español)
- Fase actual se calcula correctamente según lógica
- Alertas no duplican candidatos
- Filtro del embudo se limpia correctamente
- Colores coinciden con PHASE_CALENDAR_THEME

## 9. Implementación por pasos

### Paso 1: Utilidades (candidateFunnelUtils.ts)
- [ ] Función getCurrentPhase()
- [ ] Función calculateFunnelData()
- [ ] Función getPhaseAlerts()
- [ ] Funciones de utilidad de fechas

### Paso 2: Componente embudo (CandidateFunnel.tsx)
- [ ] Estructura básica del componente
- [ ] Cálculo de anchos proporcionales
- [ ] Barras clickeables con estado activo
- [ ] Mostrar cantidad y tasa de conversión

### Paso 3: Componente alertas (CandidateAlerts.tsx)
- [ ] Estructura básica del componente
- [ ] Lista de alertas con niveles de urgencia
- [ ] Ordenamiento por criticidad
- [ ] Links a fichas de candidatos

### Paso 4: Integración en página
- [ ] Importar componentes en /candidatos
- [ ] Agregar estado de filtro por fase
- [ ] Aplicar filtro a tabla de candidatos
- [ ] Layout responsivo

### Paso 5: Estilos y pulido
- [ ] Colores del embudo según tema
- [ ] Iconos de urgencia en alertas
- [ ] Animaciones al filtrar
- [ ] Testing en diferentes viewports

## 10. Notas adicionales

- El embudo debe actualizarse automáticamente al cambiar filtros existentes (rol, búsqueda)
- Las alertas deben considerar el timezone del usuario (usar date-fns con locale español)
- Considerar paginación: si hay muchos candidatos, el embudo usa todos los datos (no solo página actual)
- Cachear cálculos con useMemo para optimizar performance

## Estado

- [ ] Documentación completada
- [ ] Utilidades implementadas
- [ ] Componente embudo creado
- [ ] Componente alertas creado
- [ ] Integración completada
- [ ] Testing realizado
- [ ] Deploy a develop
- [ ] Deploy a main
