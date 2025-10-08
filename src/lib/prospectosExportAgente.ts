import type { Prospecto } from '@/types'
import autoTable from 'jspdf-autotable'


/**
 * Exporta el reporte de prospectos para un solo agente a PDF.
 * El layout es compacto y solo incluye la información del agente seleccionado.
 * No afecta el reporte general.
 */
// Usar tipo extendido para permitir propiedades agregadas por plugins
type JsPDFWithAutoTable = import('jspdf').jsPDF & { lastAutoTable?: { finalY: number }, internal?: unknown };


interface ExportAgenteOpts {
  agenteId: number | string
  agentesMap: Record<number|string, string>
  perAgentPrevCounts?: Record<number|string, number>
  filename?: string
  metaProspectos?: number
  semanaActual?: { anio: number, semana_iso: number }
  perAgentExtended?: Record<number|string, {
    conversionPendienteSeguimiento: number
    ratioDescartado: number
    forecastSemanaTotal?: number | null
  }>
  planningSummaries?: Record<number|string, { prospeccion: number, smnyl: number, total: number }>
  perAgentActivity?: Record<number|string, {
    labels?: string[], counts?: number[], breakdown?: Record<string, number>, details?: Record<string, number>
  }>
}

// (definición duplicada eliminada)

export async function exportProspectosPDFAgente(
  doc: JsPDFWithAutoTable,
  prospectos: Prospecto[],
  opts: ExportAgenteOpts,
  autoTableLib: typeof autoTable,
  titulo: string,
  // logo parameter removed (was unused)
) {
  // ...existing code...

  // --- Métricas avanzadas ---
  // ...existing code for advanced metrics section...

  // --- Planificación semanal ---
  // ...existing code for planning summary section...

  // --- Actividad semanal (gráfica y tabla) ---
  // ...existing code for activity chart and table...

  // --- Acciones específicas en la semana ---
  // ...existing code for actions section...

  // --- Glosario de abreviaturas ---
  // ...existing code for glossary section...

  // --- Footer ---
  let pageCount = 1;
  if (doc.internal && typeof doc.internal === 'object' && 'getNumberOfPages' in doc.internal && typeof (doc.internal as { getNumberOfPages?: unknown }).getNumberOfPages === 'function') {
    pageCount = (doc.internal as { getNumberOfPages: () => number }).getNumberOfPages();
  }
  for(let i=1;i<=pageCount;i++){
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(120); doc.text(`Página ${i}/${pageCount}`, 200, 290, {align:'right'}); doc.text('Lealtia',14,290); doc.setTextColor(0,0,0)
  }
  // Guardar
  const desired = opts?.filename || titulo.replace(/\s+/g,'_').toLowerCase()+'.pdf';
  doc.save(desired);
}
