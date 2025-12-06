# Fase 6 · Calendario de etapas en ficha de candidato ✅ COMPLETADO

**Estado:** ✅ Implementado y pusheado a develop (commit 1457a89)  
**Fecha:** 03/12/2025

## 1. Objetivo ✅
Agregar al PDF de la ficha un calendario "tipo SEP" que muestre únicamente los meses donde el candidato tuvo etapas o hitos, con colores/íconos que identifiquen cada fase del proceso.

## 2. Datos necesarios ✅
- ✅ **Fuente:** Columnas de fechas en tabla `candidatos` (periodo_para_registro_y_envio_de_documentos, capacitacion_cedula_a1, etc.) + campo JSONB `etapas_completadas`
- ✅ **Mapeo implementado:**
  - `monthKey = YYYY-MM` (extraído con date-fns)
  - `day = fecha.day` (parseado de formatos español e ISO)
  - `phaseType`: 9 fases definidas (Prospección, Registro, Capacitación A1, Examen, Folio OV, Playbook, Pre-escuela, Currícula CDP, Escuela Fundamental)
- ✅ **Constante:** `PHASE_CALENDAR_THEME` en `src/lib/candidatePhases.ts` con colores hex y etiquetas

## 3. Generación del calendario ✅
1. ✅ **Agrupación:** `groupEventsByMonth()` en `src/lib/calendarUtils.ts`
2. ✅ **Ordenamiento:** Solo meses con eventos, orden cronológico ascendente
3. ✅ **Cuadrícula mensual:**
   - ✅ Cabecera con nombre del mes/año capitalizado (formato español)
   - ✅ Fila de días L-D (lunes a domingo)
   - ✅ Hasta 6 filas de semanas con celdas vacías para días fuera del mes
   - ✅ Círculos de color por evento (hasta 3 círculos por día para múltiples eventos)
4. ✅ **Leyenda:** Cuadrícula de 3 columnas, altura dinámica, solo fases presentes

## 4. Implementación técnica ✅
- ✅ **Generador:** El PDF usa `jsPDF` (no @react-pdf/renderer). Calendario renderizado con jsPDF directamente
- ✅ **Componente creado:** `CandidateProcessCalendar.tsx` (React PDF, para referencia futura)
- ✅ **Utilidades:**
  - `extractCandidateEvents()` - Extrae eventos de todas las fechas del candidato
  - `generateCalendarsForEvents()` - Genera estructuras de calendarios mensuales
  - `date-fns` para manejo de fechas y locale español
- ✅ **Parseo de fechas:** Soporta formatos ISO (2025-10-21) y español (4 al 8 agosto, 29 de agosto)
- ✅ **Estilos:**
  - Tipografía Helvetica (consistente con PDF actual)
  - 2 calendarios por fila (90px × 65px cada uno)
  - Márgenes de 14px, gap de 8px entre calendarios
- ✅ **Overflow:** Cálculo automático de cuántos caben en primera página

## 5. Integración en ficha ✅
1. ✅ **Pipeline implementado en `exportCandidatoPDF()`:**
   - ✅ Extraer eventos con `extractCandidateEvents(candidato)`
   - ✅ Generar calendarios con `generateCalendarsForEvents(events)`
   - ✅ **Ubicación:** Primera página (antes de datos del candidato)
   - ✅ Datos del candidato y resúmenes en segunda página en adelante
2. ✅ **Leyenda:** Implementada en PDF, reutilizable exportando constantes de `candidatePhases.ts`

## 6. QA / pruebas visuales ✅
- ✅ **Probado con candidato paopecina3@gmail.com:**
  - ✅ Múltiples etapas (3 meses: agosto, septiembre, octubre)
  - ✅ Rangos de fechas correctamente expandidos (ej: "4 al 8 agosto" → 5 días)
  - ✅ Múltiples eventos por día (hasta 3 círculos en días con traslape)
- ✅ **Márgenes:** Respetados (14px left/right, header + 6px top)
- ✅ **Contraste:** Colores con contraste > 4.5:1 para impresión
- ✅ **Responsive:** Calendario se ajusta a espacio disponible en primera página

## 7. Pendientes adicionales / Mejoras futuras
- ⚠️ Actualizar documentación de fases si se agregan nuevas etapas (agregar a `PHASE_CALENDAR_THEME`)
- 💡 **Mejora futura:** Si se guarda `fecha_fin`, considerar sombrear rango completo (barra horizontal) en vez de círculos individuales
- 💡 **Mejora futura:** Agregar tooltip o hover en UI web para ver detalles de eventos
- 💡 **Mejora futura:** Indicador visual para etapas completadas vs pendientes

---

## Archivos creados/modificados

**Nuevos:**
- `src/lib/candidatePhases.ts` - Temas de fases y extracción de eventos
- `src/lib/calendarUtils.ts` - Utilidades para generar calendarios mensuales
- `src/components/CandidateProcessCalendar.tsx` - Componente React PDF (referencia)

**Modificados:**
- `src/lib/exporters.ts` - Integración del calendario en primera página del PDF
- `package.json` - Dependencias: date-fns, @react-pdf/renderer

**Commit:** `1457a89` - feat(fase6): calendario de etapas en ficha de candidato
