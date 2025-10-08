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
  logo?: string,
  logoW: number = 32,
  logoH: number = 32
) {
  // --- Header ---

  // --- Header ---
  const generadoEn = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
  doc.setFont('helvetica','bold');
  doc.setFontSize(13);
  doc.setFillColor(7,46,64); doc.rect(0,0,210,22,'F');
  if(logo && logoW && logoH){
    try { doc.addImage(logo, 'PNG', 10, 3, logoW, logoH); } catch {/*ignore*/}
  }
  doc.setTextColor(255,255,255);
  doc.text(titulo, 50, 14);
  doc.setFontSize(8);
  doc.text('Generado (CDMX): '+ generadoEn, 50, 20);
  doc.setTextColor(0,0,0);
  let y = 32;

  // --- Resumen del agente (tabla) ---
  const agenteId = opts?.agenteId;
  const agentesMap = opts?.agentesMap || {};
  const nombre = agentesMap[agenteId] || agenteId;
  const agPros = prospectos.filter(p => p.agente_id === agenteId);
  const previas = opts?.perAgentPrevCounts?.[agenteId] ?? 0;
  const total = agPros.length + previas;
  const pendiente = agPros.filter(p => p.estado === 'pendiente').length;
  const seguimiento = agPros.filter(p => p.estado === 'seguimiento').length;
  const conCita = agPros.filter(p => p.estado === 'con_cita').length;
  const descartado = agPros.filter(p => p.estado === 'descartado').length;
  const clientes = agPros.filter(p => p.estado === 'ya_es_cliente').length;
  autoTableLib(doc, {
    startY: y,
    head: [['Agente','Total','Pendiente','Seguimiento','Con cita','Descartado','Clientes','Previas']],
    body: [[nombre, total, pendiente, seguimiento, conCita, descartado, clientes, previas]],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [7, 46, 64], fontSize: 10, textColor: [255, 255, 255], halign: 'center' },
    alternateRowStyles: { fillColor: [245, 247, 248] },
    theme: 'grid',
    margin: { left: 14, right: 14 },
    tableWidth: 'wrap',
  });
  y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : y;

    // --- Gráfica de barras y tarjetas ---
    // Márgenes y separación
    const GAP = 16;
    y += GAP;
    const chartX = 26, chartY = y+2, chartW = 80, chartH = 18;
  const meta = opts?.metaProspectos ?? null;
    const labelsGraficas = ['Pendiente', 'Seguimiento', 'Con cita', 'Descartado', 'Clientes', 'Previas'];
    const totales = [pendiente, seguimiento, conCita, descartado, clientes, previas];
    const max = Math.max(...totales, meta || 1);
    doc.setDrawColor(0); doc.setLineWidth(0.2);
    doc.line(chartX, chartY, chartX, chartY+chartH);
    doc.line(chartX, chartY+chartH, chartX+chartW, chartY+chartH);
    // Barras
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
      const barH = (val/max)*chartH;
  const color = barColors[i] as [number, number, number];
  doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(x, chartY+chartH-barH, barW, barH, 'F');
      doc.setFontSize(8);
      doc.text(String(val), x + barW/2, chartY+chartH-barH-2, {align:'center'});
      doc.setFontSize(7);
      doc.text(labelsGraficas[i], x + barW/2, chartY+chartH+8, {align:'center'});
    });
    // Barra de meta prospectos (horizontal, debajo de la gráfica, dentro del área)
    let metaBarEndY = chartY + chartH;
    if(meta){
      const metaTotal = meta + previas;
      const avance = total;
      const porcentaje = metaTotal > 0 ? Math.min(100, (avance/metaTotal)*100) : 0;
      const metaY = chartY+chartH+18;
      const metaW = Math.round(chartW * 0.65);
      const metaBarH = 7;
      doc.setFillColor(7,46,64);
      doc.rect(chartX, metaY, metaW, metaBarH, 'F');
      const avanceW = metaTotal > 0 ? Math.min(metaW, (avance/metaTotal)*metaW) : 0;
      doc.setFillColor(60, 60, 60);
      doc.rect(chartX, metaY, avanceW, metaBarH, 'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(8);
      doc.setTextColor(7,46,64);
      doc.text('Meta', chartX-2, metaY+metaBarH/2+2, {align:'right'});
      doc.setTextColor(0,0,0);
      const metaLabel = `${avance}/ Meta: ${metaTotal}, ${porcentaje.toFixed(1)}%`;
      const maxLabelWidth = chartW - metaW - 12;
      let fontSize = 10;
      doc.setFont('helvetica','bold');
      while(fontSize > 6 && doc.getTextWidth(metaLabel) > maxLabelWidth) {
        fontSize--;
        doc.setFontSize(fontSize);
      }
      const labelX = chartX + metaW + 8;
      doc.text(metaLabel, labelX, metaY+metaBarH/2+3, {align:'left'});
      metaBarEndY = metaY + metaBarH;
    }
    // Tarjetas de resumen a la derecha de la gráfica
    const totalConPrevias = total;
    const tarjetas = [
      ['Total', `${totalConPrevias} (100.0%)`],
      ['Pendiente', `${pendiente} (${((pendiente/totalConPrevias)*100||0).toFixed(1)}%)`],
      ['Seguimiento', `${seguimiento} (${((seguimiento/totalConPrevias)*100||0).toFixed(1)}%)`],
      ['Con cita', `${conCita} (${((conCita/totalConPrevias)*100||0).toFixed(1)}%)`],
      ['Descartado', `${descartado} (${((descartado/totalConPrevias)*100||0).toFixed(1)}%)`],
      ['Clientes', `${clientes} (${((clientes/totalConPrevias)*100||0).toFixed(1)}%)`],
      ['Previas', `${previas} (${((previas/totalConPrevias)*100||0).toFixed(1)}%)`],
    ];
    const cxT = chartX+chartW+10; let cyT = chartY;
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
    // Ajustar y para que todo el contenido posterior quede debajo de la barra de meta y tarjetas
    y = Math.max(metaBarEndY, cyT) + GAP;
    // (Las tarjetas y el ajuste de y ya están dentro del bloque anterior)


  // --- Tabla de prospectos de la semana ---
  y += GAP;
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.text('Prospectos de la semana', 14, y);
  y += 4;
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  autoTableLib(doc, {
    startY: y,
    head: [['Nombre','Teléfono','Estado','Notas']],
    body: agPros.map(p => [p.nombre, p.telefono || '', p.estado, (p.notas || '').slice(0, 120)]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
    alternateRowStyles: { fillColor: [245, 247, 248] },
    theme: 'grid',
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + GAP : y;


  // --- Prospectos de semanas previas ---
  // Lógica igual al front: semanas previas = mismo año, semana_iso < semana seleccionada, y estado activo
  const semanaActiva = opts?.semanaActual?.semana_iso;
  const anioActivo = opts?.semanaActual?.anio;
  const prevPros = agPros.filter(p =>
    typeof p.semana_iso === 'number' &&
    typeof p.anio === 'number' &&
    anioActivo && semanaActiva &&
    p.anio === anioActivo &&
    p.semana_iso < semanaActiva &&
    ['pendiente','seguimiento','con_cita'].includes(p.estado)
  );
  if (prevPros.length > 0) {
    y += GAP;
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.text('Prospectos de semanas previas', 14, y);
    y += 4;
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    autoTableLib(doc, {
      startY: y,
      head: [['Nombre','Teléfono','Estado','Notas','Semana']],
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
    });
    y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + GAP : y;
  }

  // --- Barra de meta prospectos (horizontal, debajo de la gráfica, dentro del área) ---
  // (Ya implementada en la sección de gráfica/meta arriba)


  // --- Métricas avanzadas ---
  if (opts?.perAgentExtended && opts.perAgentExtended[agenteId]) {
    y += GAP;
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Métricas avanzadas',14,y); y+=4;
    const m = opts.perAgentExtended[agenteId];
    const conv = m ? (m.conversionPendienteSeguimiento||0)*100 : 0;
    const desc = m ? (m.ratioDescartado||0)*100 : 0;
    const pctCliente = m && total ? (clientes/total)*100 : 0;
    const proy = m ? m.forecastSemanaTotal ?? null : null;
    autoTableLib(doc, {
      startY: y,
      head: [['Conv P->S','Desc %','% Cliente','Proy semana']],
      body: [[
        conv.toFixed(1)+'%',
        desc.toFixed(1)+'%',
        pctCliente.toFixed(1)+'%',
        proy !== null ? proy : '-'
      ]],
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
      alternateRowStyles: { fillColor: [245, 247, 248] },
      theme: 'grid',
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + GAP : y;
  }


  // --- Planificación semanal ---
  if (opts?.planningSummaries && opts.planningSummaries[agenteId]) {
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Planificación semanal',14,y); y+=4;
    const sum = opts.planningSummaries[agenteId];
    autoTableLib(doc, {
      startY: y,
      head: [['Prospección','Cita','Total']],
      body: [[sum.prospeccion, sum.smnyl, sum.total]],
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
      alternateRowStyles: { fillColor: [245, 247, 248] },
      theme: 'grid',
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + GAP : y;
  }


  // --- Actividad semanal (gráfica y tabla) ---
  if (opts?.perAgentActivity && opts.perAgentActivity[agenteId]) {
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Actividad semanal',14,y); y+=4;
    const act = opts.perAgentActivity[agenteId];
    if (act.labels && act.counts) {
      // Gráfica de barras horizontal simple
      const chartX = 26, chartY = y+2, chartW = 120, chartH = 18;
      const max = Math.max(...act.counts, 1);
      const barW = 10;
      const barGap = (chartW - (act.labels.length * barW)) / (act.labels.length - 1);
      act.counts.forEach((val: number, i: number) => {
        const x = chartX + i * (barW + barGap);
        const barH = (val/max)*chartH;
        doc.setFillColor(33, 150, 243);
        doc.rect(x, chartY+chartH-barH, barW, barH, 'F');
        doc.setFontSize(8);
        doc.text(String(val), x + barW/2, chartY+chartH-barH-2, {align:'center'});
        doc.setFontSize(7);
        if (act.labels && act.labels[i]) {
          doc.text(act.labels[i], x + barW/2, chartY+chartH+8, {align:'center'});
        }
      });
      y = chartY + chartH + GAP;
    }
    // Tabla de actividad
    if (act.breakdown) {
      autoTableLib(doc, {
        startY: y,
        head: [['Vistas','Clicks','Formularios','Prospectos','Planificación','Clientes','Pólizas','Usuarios','Parámetros','Reportes','Otros']],
        body: [[
          act.breakdown.views||0, act.breakdown.clicks||0, act.breakdown.forms||0, act.breakdown.prospectos||0, act.breakdown.planificacion||0, act.breakdown.clientes||0, act.breakdown.polizas||0, act.breakdown.usuarios||0, act.breakdown.parametros||0, act.breakdown.reportes||0, act.breakdown.otros||0
        ]],
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
        alternateRowStyles: { fillColor: [245, 247, 248] },
        theme: 'grid',
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + GAP : y;
    }
  }


  // --- Acciones específicas en la semana ---
  if (opts?.perAgentActivity && opts.perAgentActivity[agenteId] && opts.perAgentActivity[agenteId].details) {
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Acciones específicas en la semana',14,y); y+=4;
    const d = opts.perAgentActivity[agenteId].details;
    autoTableLib(doc, {
      startY: y,
      head: [['Altas P.','Cambios est.','Notas P.','Edit. planif.','Altas cliente','Modif. cliente','Altas pól.','Modif. pól.','P. a cliente']],
      body: [[
        d.prospectos_altas||0, d.prospectos_cambios_estado||0, d.prospectos_notas||0, d.planificacion_ediciones||0, d.clientes_altas||0, d.clientes_modificaciones||0, d.polizas_altas||0, d.polizas_modificaciones||0, d.prospectos_a_cliente||0
      ]],
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
      alternateRowStyles: { fillColor: [245, 247, 248] },
      theme: 'grid',
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + GAP : y;
  }


  // --- Glosario de abreviaturas ---
  y += GAP;
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text('Glosario de abreviaturas',14,y); doc.setFont('helvetica','normal'); y += 4;
  const glossary: Array<[string,string]> = [
    ['Pendiente', 'Prospecto pendiente de gestión'],
    ['Seguimiento', 'Prospecto en seguimiento activo'],
    ['Con cita', 'Prospecto con cita agendada'],
    ['Descartado', 'Prospecto descartado'],
    ['Clientes', 'Prospectos que ya son clientes'],
    ['Previas', 'Prospectos arrastrados de semanas anteriores'],
    ['Cita','bloques de actividad Cita'],
    ['Conv P->S','Conversión de Pendiente a Seguimiento'],
    ['Desc %','Porcentaje de prospectos descartados'],
    ['Proy semana','Proyección de total de la semana (forecast)'],
    ['Planif.','Planificación'],
    ['Altas P.','Altas de prospectos'],
    ['Cambios est.','Cambios de estado en prospectos'],
    ['Notas P.','Notas registradas en prospectos'],
    ['Edit. planif.','Ediciones en la planificación semanal'],
    ['Altas cliente','Altas de clientes'],
    ['Modif. cliente','Modificaciones de clientes'],
    ['Altas pól.','Altas de pólizas'],
    ['Modif. pól.','Modificaciones de pólizas'],
    ['Forms','Formularios enviados'],
    ['Vistas','Vistas registradas en la aplicación'],
    ['Clicks','Clicks registrados en la aplicación'],
    ['P. a cliente','Prospectos convertidos a cliente en la semana actual'],
  ];
  autoTableLib(doc, {
    startY: y,
    head: [['Abrev.','Significado']],
    body: glossary,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
    alternateRowStyles: { fillColor: [245, 247, 248] },
    theme: 'grid',
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + GAP : y;

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
