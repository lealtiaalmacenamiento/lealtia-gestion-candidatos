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
  logo?: string, // base64 PNG de public/Logolealtiaruedablanca.png
  logoW: number = 32,
  logoH: number = 32
) {
  // --- INICIO: Lógica copiada/adaptada del export general ---
  // Helpers y layout
  const MX_TZ = 'America/Mexico_City';
  function nowMX() {
    const d = new Date();
    const fecha = new Intl.DateTimeFormat('es-MX', { timeZone: MX_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    const hora = new Intl.DateTimeFormat('es-MX', { timeZone: MX_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return `${fecha} ${hora}`;
  }
  const generadoEn = nowMX();
  // Solo un agente
  const agenteId = opts?.agenteId;
  const agentesMap = opts?.agentesMap || {};
  let customTitulo = titulo;
  // Mostrar semana en el header igual que el general
  if (agenteId && agentesMap[agenteId]) {
    const semanaTxt = opts?.semanaActual ? ` | Semana ${opts.semanaActual.semana_iso} (${opts.semanaActual.anio})` : '';
    customTitulo = `Reporte de prospectos del agente: ${agentesMap[agenteId]}${semanaTxt}`;
  }
  // Header
  const drawHeader = () => {
    const baseX = logo ? 50 : 12;
    const marginRight = 8;
    const maxWidth = 210 - baseX - marginRight;
    let headerHeight = 22;
    let fontSize = 13;
    doc.setFont('helvetica', 'bold');
    let width = 0;
    while (fontSize >= 8) { doc.setFontSize(fontSize); width = doc.getTextWidth(customTitulo); if (width <= maxWidth) break; fontSize--; }
    let lines: string[] = [];
    if (width > maxWidth) {
      const words = customTitulo.split(/\s+/);
      let current = '';
      words.forEach(w => { const test = current ? current + ' ' + w : w; const testW = doc.getTextWidth(test); if (testW <= maxWidth) current = test; else { if(current) lines.push(current); current = w; } });
      if (current) lines.push(current);
    } else lines = [customTitulo];
    while (lines.length > 3 && fontSize > 7) { fontSize--; doc.setFontSize(fontSize); const words = customTitulo.split(/\s+/); lines = []; let current = ''; words.forEach(w => { const test = current ? current + ' ' + w : w; const testW = doc.getTextWidth(test); if (testW <= maxWidth) current = test; else { if(current) lines.push(current); current = w; } }); if (current) lines.push(current); }
    const lineHeight = fontSize + 2;
    const dateFontSize = 8;
    const neededHeight = 6 + lines.length * lineHeight + 2 + dateFontSize + 6;
    if (neededHeight > headerHeight) headerHeight = neededHeight;
    doc.setFillColor(7, 46, 64); doc.rect(0, 0, 210, headerHeight, 'F');
    if (logo && logoW && logoH) {
      try {
        // Get real image size using jsPDF's getImageProperties
        const props = doc.getImageProperties(logo);
        const aspect = props.width / props.height;
        let drawW = logoW;
        let drawH = logoH;
        if (logoW / logoH > aspect) {
          drawW = logoH * aspect;
          drawH = logoH;
        } else {
          drawW = logoW;
          drawH = logoW / aspect;
        }
        doc.addImage(logo, 'PNG', 10, (headerHeight - drawH) / 2, drawW, drawH);
      } catch {/*ignore*/}
    } else {
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(255,255,255); doc.text('LOGO', 12, 14);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fontSize);
    lines.forEach((l, i) => { const baseline = 6 + (i + 1) * lineHeight - (lineHeight - fontSize) / 2; doc.text(l, baseX, baseline); });
    const dateY = 6 + lines.length * lineHeight + 2 + dateFontSize;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(dateFontSize);
    doc.text('Generado (CDMX): ' + generadoEn, baseX, dateY);
    doc.setTextColor(0, 0, 0);
    const contentStartY = headerHeight + 6;
    return { headerHeight, contentStartY };
  };
  const { headerHeight, contentStartY } = drawHeader();
  doc.setFontSize(9);
  const GAP = 12;
  const SECTION_GAP = 14;
  const docTyped = doc as unknown as JsPDFWithAutoTable;
  const PAGE_H: number = docTyped.internal.pageSize.getHeight();
  const TOP_MARGIN = headerHeight + 6;
  const BOTTOM_MARGIN = 22;
  const ensure = (currentY: number, required: number) => {
    const limit = PAGE_H - BOTTOM_MARGIN;
    if (currentY + required > limit) { doc.addPage(); drawHeader(); return TOP_MARGIN; }
    return Math.max(currentY, TOP_MARGIN);
  };

  // --- Filtrar datos solo del agente seleccionado ---
  const agPros = prospectos.filter(p => p.agente_id === agenteId);
  const previas = opts?.perAgentPrevCounts?.[agenteId] ?? 0;
  const total = agPros.length + previas;
  const pendiente = agPros.filter(p => p.estado === 'pendiente').length;
  const seguimiento = agPros.filter(p => p.estado === 'seguimiento').length;
  const conCita = agPros.filter(p => p.estado === 'con_cita').length;
  const descartado = agPros.filter(p => p.estado === 'descartado').length;
  const clientes = agPros.filter(p => p.estado === 'ya_es_cliente').length;
  let y = contentStartY;

  // --- Resumen del agente (dashboard) ---
  y = ensure(y, 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Resumen por agente', 14, y);
  y += 8;
  const resumenHead = ['Agente', 'Total', 'Pendiente', 'Seguimiento', 'Con cita', 'Descartado', 'Clientes', 'Previas'];
  const resumenBody = [[agentesMap[agenteId] || agenteId, total, pendiente, seguimiento, conCita, descartado, clientes, previas]];
  autoTableLib(doc, {
    startY: y,
    head: [resumenHead],
    body: resumenBody,
    styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [7, 46, 64], fontSize: 10, textColor: [255, 255, 255], halign: 'center' },
    alternateRowStyles: { fillColor: [245, 247, 248] },
    theme: 'grid',
    margin: { left: 14, right: 14 },
    tableWidth: 'wrap',
    didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0); }
  });
  y = docTyped.lastAutoTable ? docTyped.lastAutoTable.finalY! + 8 : y + 8;

  // --- Gráfica de barras y meta (idéntica al general) ---
  y += 18;
  const labelsGraficas = ['Pendiente', 'Seguimiento', 'Con cita', 'Descartado', 'Clientes', 'Previas'];
  const totales = [pendiente, seguimiento, conCita, descartado, clientes, previas];
  const chartX = 26, chartY = y + 2, chartW = 80, chartH = 18;
  const meta = opts?.metaProspectos ?? null;
  const max = Math.max(...totales, meta || 1);
  doc.setDrawColor(0); doc.setLineWidth(0.2);
  doc.line(chartX, chartY, chartX, chartY + chartH);
  doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);
  const barW = 8;
  const barColors = [
    [255, 193, 7],    // Pendiente: amarillo
    [33, 150, 243],   // Seguimiento: azul
    [0, 200, 83],     // Con cita: verde
    [158, 158, 158],  // Descartado: gris
    [25, 118, 210],   // Clientes: azul fuerte
    [120, 144, 156]   // Previas: gris azulado
  ];
  const barGap = (chartW - (labelsGraficas.length * barW)) / (labelsGraficas.length - 1);
  totales.forEach((val: number, i: number) => {
    const x = chartX + i * (barW + barGap);
    const barH = (val / max) * chartH;
  const color = barColors[i] as [number, number, number];
  doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x, chartY + chartH - barH, barW, barH, 'F');
    doc.setFontSize(8);
    doc.text(String(val), x + barW / 2, chartY + chartH - barH - 2, { align: 'center' });
    doc.setFontSize(7);
    doc.text(labelsGraficas[i], x + barW / 2, chartY + chartH + 8, { align: 'center' });
  });
  // Barra de meta prospectos (horizontal, debajo de la gráfica, dentro del área)
  if (meta) {
    const metaTotal = meta + previas;
    const avance = total;
    const porcentaje = metaTotal > 0 ? Math.min(100, (avance / metaTotal) * 100) : 0;
    const metaY = chartY + chartH + 18;
    const metaW = Math.round(chartW * 0.65);
    const metaBarH = 7;
    doc.setFillColor(7, 46, 64);
    doc.rect(chartX, metaY, metaW, metaBarH, 'F');
    const avanceW = metaTotal > 0 ? Math.min(metaW, (avance / metaTotal) * metaW) : 0;
    doc.setFillColor(60, 60, 60);
    doc.rect(chartX, metaY, avanceW, metaBarH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(7, 46, 64);
    doc.text('Meta', chartX - 2, metaY + metaBarH / 2 + 2, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    const metaLabel = `${avance}/ Meta: ${metaTotal}, ${porcentaje.toFixed(1)}%`;
    const maxLabelWidth = chartW - metaW - 12;
    let fontSize = 10;
    doc.setFont('helvetica', 'bold');
    while (fontSize > 6 && doc.getTextWidth(metaLabel) > maxLabelWidth) {
      fontSize--;
      doc.setFontSize(fontSize);
    }
    const labelX = chartX + metaW + 8;
    doc.text(metaLabel, labelX, metaY + metaBarH / 2 + 3, { align: 'left' });
    y = metaY + metaBarH + 8;
  } else {
    y = chartY + chartH + 14;
  }
  // Tarjetas de resumen a la derecha de la gráfica
  const totalConPrevias = total;
  const tarjetas = [
    ['Total', `${totalConPrevias} (100.0%)`],
    ['Pendiente', `${pendiente} (${((pendiente / totalConPrevias) * 100 || 0).toFixed(1)}%)`],
    ['Seguimiento', `${seguimiento} (${((seguimiento / totalConPrevias) * 100 || 0).toFixed(1)}%)`],
    ['Con cita', `${conCita} (${((conCita / totalConPrevias) * 100 || 0).toFixed(1)}%)`],
    ['Descartado', `${descartado} (${((descartado / totalConPrevias) * 100 || 0).toFixed(1)}%)`],
    ['Clientes', `${clientes} (${((clientes / totalConPrevias) * 100 || 0).toFixed(1)}%)`],
    ['Previas', `${previas} (${((previas / totalConPrevias) * 100 || 0).toFixed(1)}%)`],
  ];
  const cxT = chartX + chartW + 10; let cyT = chartY;
  const cardWT = 60, cardHT = 14;
  tarjetas.forEach((c) => {
    doc.setDrawColor(220);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(cxT, cyT, cardWT, cardHT, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.text(c[0], cxT + 3, cyT + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(c[1], cxT + 3, cyT + 12);
    cyT += cardHT + 4;
  });
  y = Math.max(y, cyT);

  // --- Tabla de prospectos de la semana ---
  y += GAP;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Prospectos de la semana', 14, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  autoTableLib(doc, {
    startY: y,
    head: [['Nombre', 'Teléfono', 'Estado', 'Notas']],
    body: agPros.map(p => [p.nombre, p.telefono || '', p.estado, (p.notas || '').slice(0, 120)]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
    alternateRowStyles: { fillColor: [245, 247, 248] },
    theme: 'grid',
    margin: { left: 14, right: 14 },
    didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0); }
  });
  y = docTyped.lastAutoTable ? docTyped.lastAutoTable.finalY! + GAP : y + GAP;

  // --- Prospectos de semanas anteriores ---
  // Filtrar prospectos del agente que sean de semanas previas a la actual
  const semanaActiva = opts?.semanaActual?.semana_iso;
  const anioActivo = opts?.semanaActual?.anio;
  const prevPros = agPros.filter(p =>
    typeof p.semana_iso === 'number' &&
    typeof p.anio === 'number' &&
    anioActivo && semanaActiva &&
    p.anio === anioActivo &&
    p.semana_iso < semanaActiva &&
    ['pendiente', 'seguimiento', 'con_cita'].includes(p.estado)
  );
  if (prevPros.length > 0) {
    y = ensure(y, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Prospectos de semanas anteriores', 14, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    autoTableLib(doc, {
      startY: y,
      head: [['Nombre', 'Teléfono', 'Estado', 'Notas', 'Semana']],
      body: prevPros.map(p => [
        p.nombre,
        p.telefono || '',
        p.estado,
        (p.notas || '').slice(0, 120),
        `Semana ${p.semana_iso} (${p.anio})`
      ]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
      alternateRowStyles: { fillColor: [245, 247, 248] },
      theme: 'grid',
      margin: { left: 14, right: 14 },
      didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0); }
    });
    y = docTyped.lastAutoTable ? docTyped.lastAutoTable.finalY! + GAP : y + GAP;
  }

  // --- Prospectos de semanas previas ---
  // --- Prospectos de semanas anteriores ---
  // Ya implementado abajo, no duplicar declaración

  // --- Métricas avanzadas ---
  if (opts?.perAgentExtended && opts.perAgentExtended[agenteId]) {
    y = ensure(y, 10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Métricas avanzadas', 14, y); y += 4;
    const m = opts.perAgentExtended[agenteId];
    const conv = m ? (m.conversionPendienteSeguimiento || 0) * 100 : 0;
    const desc = m ? (m.ratioDescartado || 0) * 100 : 0;
    const pctCliente = m && total ? (clientes / total) * 100 : 0;
    const proy = m ? m.forecastSemanaTotal ?? null : null;
    autoTableLib(doc, {
      startY: y,
      head: [['Conv P->S', 'Desc %', '% Cliente', 'Proy semana']],
      body: [[
        conv.toFixed(1) + '%',
        desc.toFixed(1) + '%',
        pctCliente.toFixed(1) + '%',
        proy !== null ? proy : '-'
      ]],
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
      alternateRowStyles: { fillColor: [245, 247, 248] },
      theme: 'grid',
      margin: { left: 14, right: 14 },
      didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0); }
    });
    y = docTyped.lastAutoTable ? docTyped.lastAutoTable.finalY! + GAP : y + GAP;
  }

  // --- Planificación semanal ---
  if (opts?.planningSummaries && opts.planningSummaries[agenteId]) {
    y = ensure(y, 10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Planificación semanal', 14, y); y += 4;
    const sum = opts.planningSummaries[agenteId];
    autoTableLib(doc, {
      startY: y,
      head: [['Prospección', 'Cita', 'Total']],
      body: [[sum.prospeccion, sum.smnyl, sum.total]],
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
      alternateRowStyles: { fillColor: [245, 247, 248] },
      theme: 'grid',
      margin: { left: 14, right: 14 },
      didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0); }
    });
    y = docTyped.lastAutoTable ? docTyped.lastAutoTable.finalY! + GAP : y + GAP;
  }

  // --- Actividad semanal (gráfica y tabla) ---
  if (opts?.perAgentActivity && opts.perAgentActivity[agenteId]) {
    y = ensure(y, 40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Actividad semanal', 14, y); y += 4;
    const act = opts.perAgentActivity[agenteId];
    if (act.labels && act.counts && Array.isArray(act.labels) && Array.isArray(act.counts)) {
      // --- Line chart (idéntico al general) ---
      const chartX = 26, chartY = y + 2, chartW = 160, chartH = 42;
      const max = Math.max(...act.counts, 1);
      doc.setDrawColor(0); doc.setLineWidth(0.2);
      doc.line(chartX, chartY, chartX, chartY + chartH);
      doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);
      let prevX: number | undefined = undefined, prevY: number | undefined = undefined;
      act.counts.forEach((val: number, i: number) => {
        const x = chartX + (chartW / ((act.counts && act.counts.length > 1 ? act.counts.length - 1 : 1)) ) * i;
        const yPt = chartY + chartH - (val / max) * chartH;
        if (prevX !== undefined) { doc.line(prevX, prevY!, x, yPt); }
        doc.setFillColor(0, 0, 0);
        try { if (typeof (docTyped as JsPDFWithAutoTable).circle === 'function') { (docTyped as JsPDFWithAutoTable).circle!(x, yPt, 1.2, 'F'); } } catch { /* ignore circle error */ }
        prevX = x; prevY = yPt;
      });
      doc.setFontSize(7);
      act.labels.forEach((l: string, i: number) => {
        const x = chartX + (chartW / ((act.labels && act.labels.length > 1 ? act.labels.length - 1 : 1)) ) * i;
        doc.text(l, x - 3, chartY + chartH + 6);
      });
      doc.setFontSize(8); doc.text(String(max), chartX - 6, chartY + 4);
      y = chartY + chartH + 14;
    }
    // Tabla de actividad (idéntica al general)
    if (act.breakdown) {
      autoTableLib(doc, {
        startY: y,
        head: [['Vistas', 'Clicks', 'Formularios', 'Prospectos', 'Planificación', 'Clientes', 'Pólizas', 'Usuarios', 'Parámetros', 'Reportes', 'Otros']],
        body: [[
          act.breakdown.views || 0, act.breakdown.clicks || 0, act.breakdown.forms || 0, act.breakdown.prospectos || 0, act.breakdown.planificacion || 0, act.breakdown.clientes || 0, act.breakdown.polizas || 0, act.breakdown.usuarios || 0, act.breakdown.parametros || 0, act.breakdown.reportes || 0, act.breakdown.otros || 0
        ]],
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
        alternateRowStyles: { fillColor: [245, 247, 248] },
        theme: 'grid',
        margin: { left: 14, right: 14 },
        didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0); }
      });
      y = docTyped.lastAutoTable ? docTyped.lastAutoTable.finalY! + GAP : y + GAP;
    }
  }

  // --- Acciones específicas en la semana ---
  if (opts?.perAgentActivity && opts.perAgentActivity[agenteId] && opts.perAgentActivity[agenteId].details) {
    y = ensure(y, 12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Acciones específicas en la semana', 14, y); y += 4;
    const d = opts.perAgentActivity[agenteId].details;
    autoTableLib(doc, {
      startY: y,
      head: [['Altas P.', 'Cambios est.', 'Notas P.', 'Edit. planif.', 'Altas cliente', 'Modif. cliente', 'Altas pól.', 'Modif. pól.', 'P. a cliente']],
      body: [[
        d.prospectos_altas || 0, d.prospectos_cambios_estado || 0, d.prospectos_notas || 0, d.planificacion_ediciones || 0, d.clientes_altas || 0, d.clientes_modificaciones || 0, d.polizas_altas || 0, d.polizas_modificaciones || 0, d.prospectos_a_cliente || 0
      ]],
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
      alternateRowStyles: { fillColor: [245, 247, 248] },
      theme: 'grid',
      margin: { left: 14, right: 14 },
      didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0); }
    });
    y = docTyped.lastAutoTable ? docTyped.lastAutoTable.finalY! + GAP : y + GAP;
  }

  // --- Glosario de abreviaturas ---
  try {
    y = ensure(y, 8);
    doc.setDrawColor(230); doc.line(14, y, 196, y); y += SECTION_GAP;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Glosario de abreviaturas', 14, y); doc.setFont('helvetica', 'normal'); y += 4;
    const glossary: Array<[string, string]> = [
      ['Pendiente', 'Prospecto pendiente de gestión'],
      ['Seguimiento', 'Prospecto en seguimiento activo'],
      ['Con cita', 'Prospecto con cita agendada'],
      ['Descartado', 'Prospecto descartado'],
      ['Clientes', 'Prospectos que ya son clientes'],
      ['Previas', 'Prospectos arrastrados de semanas anteriores'],
      ['Cita', 'bloques de actividad Cita'],
      ['Conv P->S', 'Conversión de Pendiente a Seguimiento'],
      ['Desc %', 'Porcentaje de prospectos descartados'],
      ['Proy semana', 'Proyección de total de la semana (forecast)'],
      ['Planif.', 'Planificación'],
      ['Altas P.', 'Altas de prospectos'],
      ['Cambios est.', 'Cambios de estado en prospectos'],
      ['Notas P.', 'Notas registradas en prospectos'],
      ['Edit. planif.', 'Ediciones en la planificación semanal'],
      ['Altas cliente', 'Altas de clientes'],
      ['Modif. cliente', 'Modificaciones de clientes'],
      ['Altas pól.', 'Altas de pólizas'],
      ['Modif. pól.', 'Modificaciones de pólizas'],
      ['Forms', 'Formularios enviados'],
      ['Vistas', 'Vistas registradas en la aplicación'],
      ['Clicks', 'Clicks registrados en la aplicación'],
      ['P. a cliente', 'Prospectos convertidos a cliente en la semana actual'],
    ];
    const headGloss = ['Abrev.', 'Significado'];
    y = ensure(y, 24);
    autoTableLib(doc, {
      startY: y,
      head: [headGloss],
      body: glossary.map(([k, v]) => [k, v]),
      styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [235, 239, 241], textColor: [7, 46, 64], fontSize: 8 },
      theme: 'grid',
      margin: { top: headerHeight + 6, left: 14, right: 14 },
      columnStyles: { 0: { cellWidth: 30, halign: 'left' }, 1: { halign: 'left' } },
      didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0); }
    });
    y = docTyped.lastAutoTable ? docTyped.lastAutoTable.finalY! + GAP : y + GAP;
  } catch { /* ignore glossary render errors */ }

  // --- Footer con paginación ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageCount: number = (docTyped.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    docTyped.setPage(i);
    const footerY = PAGE_H - 8;
    docTyped.setFontSize(7); docTyped.setTextColor(120); docTyped.text(`Página ${i}/${pageCount}`, 200, footerY, { align: 'right' }); docTyped.text('Lealtia', 14, footerY); docTyped.setTextColor(0, 0, 0);
  }
  // Guardar
  const desired = opts?.filename || titulo.replace(/\s+/g, '_').toLowerCase() + '.pdf';
  doc.save(desired);
  // --- FIN: Lógica copiada/adaptada del export general ---
}
