# Fase 6 · Calendario de etapas en ficha de candidato

## 1. Objetivo
Agregar al PDF de la ficha un calendario "tipo SEP" que muestre únicamente los meses donde el candidato tuvo etapas o hitos, con colores/íconos que identifiquen cada fase del proceso.

## 2. Datos necesarios
- Fuente: tabla/historial `candidatos_etapas` (o equivalente) con campos `fase`, `fecha_inicio`, `fecha_fin` opcional.
- Cada registro debe mapearse a:
  - `monthKey = YYYY-MM`
  - `day = fecha_inicio.day`
  - `phaseType` (ej. Prospección, Entrevista, Capacitación, Alta).
- Definir constante compartida `PHASE_CALENDAR_THEME` con color + icono por fase.

## 3. Generación del calendario
1. Agrupar eventos por mes (`monthKey`).
2. Ordenar meses ascendente y renderizar solo los que tengan eventos (no mostrar meses vacíos).
3. Por cada mes crear una cuadrícula mínima:
   - Cabecera con nombre del mes/año.
   - Fila de días (L a D) y hasta 6 filas de semanas.
   - Marcar el día de cada evento con círculo relleno del color asignado; sobreponer icono (SVG simple).
4. Añadir leyenda automática al final listando solo las fases presentes.

## 4. Implementación técnica
- El generador actual usa (confirmar) `@react-pdf/renderer`.
- Crear componente `CandidateProcessCalendar`:
  - Props: `months: Array<{ month: string, events: Array<{ day: number, phase: PhaseKey, label: string }> }>`.
  - Usa utilidades de fecha (`date-fns`) para construir la cuadrícula.
- Estilos:
  - Mantener tipografía oficial (Inter/Roboto según PDF actual).
  - Cada celda ~20px para caber hasta 4 meses por fila si es necesario.
- Considerar overflow: si hay más de 6 meses, dividir en múltiples filas dentro del PDF.

## 5. Integración en ficha
1. En el pipeline que arma el PDF:
   - Obtener eventos del candidato (orden cronológico).
   - Transformar a estructura del componente.
   - Insertar el calendario después de la sección de resumen del proceso.
2. Añadir bloque "Leyenda" reutilizable para UI web (evita duplicar colores).

## 6. QA / pruebas visuales
- Probar candidatos con:
  - 1 sola etapa (1 mes) → calendario muestra solo ese mes.
  - Etapas en meses no consecutivos.
  - Más de 6 meses (verificar salto de página).
- Validar que se respeten márgenes y no se corta texto.
- Revisar impresión en papel (PDF export) para que colores tengan contraste > 4.5:1 o acompañar iconos.

## 7. Pendientes adicionales
- Actualizar documentación de fases para garantizar que toda nueva fase tenga color/icono.
- Si se guarda `fecha_fin`, considerar sombrear rango (rellenar barra) en vez de solo un día; no obligatorio para primera iteración.
