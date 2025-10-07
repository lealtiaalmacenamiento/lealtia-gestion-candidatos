
import type { Prospecto, ProspectoEstado } from '@/types'
import { ESTADO_LABEL } from './prospectosUI'

// Tipo auxiliar para doc con soporte de autoTable
interface JsPDFWithAutoTable {
  lastAutoTable?: { finalY?: number }
  internal: {
    pageSize: { getHeight: () => number }
    getNumberOfPages: () => number
  }
  setPage: (n: number) => void
  setFontSize: (n: number) => void
  setTextColor: (...args: number[]) => void
  text: (...args: unknown[]) => void
  circle?: (x:number, y:number, r:number, style?: string) => void
}

const MX_TZ='America/Mexico_City'
function nowMX(){
  const d=new Date()
  const fecha = new Intl.DateTimeFormat('es-MX',{timeZone:MX_TZ, day:'2-digit', month:'2-digit', year:'numeric'}).format(d)
  const hora = new Intl.DateTimeFormat('es-MX',{timeZone:MX_TZ, hour:'2-digit', minute:'2-digit', hour12:false}).format(d)
  return `${fecha} ${hora}`
}

// Función principal de exportación
export async function exportProspectosPDF(
  doc: any, // TODO: reemplazar por jsPDF si está importado
  prospectos: Prospecto[],
  opts: any,
  autoTable: (...args: unknown[]) => unknown,
  titulo: string,
  logo?: string,
  logoW?: number,
  logoH?: number
) {
  // Helpers y layout deben estar definidos antes de renderProspectosPorSemana
  const generadoEn = nowMX();
  const drawHeader = ()=>{
    const baseX = logo? 50:12;
    const marginRight = 8;
    const maxWidth = 210 - baseX - marginRight;
    let headerHeight = 22;
    let fontSize = 13;
    doc.setFont('helvetica','bold');
    let width = 0;
    while(fontSize>=8){ doc.setFontSize(fontSize); width = doc.getTextWidth(titulo); if(width <= maxWidth) break; fontSize--; }
    let lines: string[] = [];
    if(width > maxWidth){
      const words = titulo.split(/\s+/);
      let current = '';
      words.forEach(w=>{ const test = current? current+' '+w: w; const testW = doc.getTextWidth(test); if(testW <= maxWidth) current=test; else { if(current) lines.push(current); current=w; } });
      if(current) lines.push(current);
    } else lines = [titulo];
    while(lines.length > 3 && fontSize > 7){ fontSize--; doc.setFontSize(fontSize); const words = titulo.split(/\s+/); lines=[]; let current=''; words.forEach(w=>{ const test = current? current+' '+w: w; const testW = doc.getTextWidth(test); if(testW <= maxWidth) current=test; else { if(current) lines.push(current); current=w; } }); if(current) lines.push(current); }
    const lineHeight = fontSize + 2;
    const dateFontSize = 8;
    const neededHeight = 6 + lines.length*lineHeight + 2 + dateFontSize + 6;
    if(neededHeight > headerHeight) headerHeight = neededHeight;
    doc.setFillColor(7,46,64); doc.rect(0,0,210,headerHeight,'F');
    if(logo && logoW && logoH){ try { doc.addImage(logo,'PNG',10,(headerHeight-logoH)/2,logoW,logoH); } catch {/*ignore*/} } else { doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(255,255,255); doc.text('LOGO', 12, 14); }
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold'); doc.setFontSize(fontSize);
    lines.forEach((l,i)=>{ const baseline = 6 + (i+1)*lineHeight - (lineHeight - fontSize)/2; doc.text(l, baseX, baseline); });
    const dateY = 6 + lines.length*lineHeight + 2 + dateFontSize;
    doc.setFont('helvetica','normal'); doc.setFontSize(dateFontSize);
    doc.text('Generado (CDMX): '+ generadoEn, baseX, dateY);
    doc.setTextColor(0,0,0);
    const contentStartY = headerHeight + 6;
    return { headerHeight, contentStartY };
  };
  const { headerHeight, contentStartY } = drawHeader();
  doc.setFontSize(9);
  const GAP = 12;
  const SECTION_GAP = 14;
  const docTyped = doc as unknown as JsPDFWithAutoTable;
  const PAGE_H: number = docTyped.internal.pageSize.getHeight();
  const BOTTOM_MARGIN = 14;
  const ensure = (currentY:number, required:number) => {
    const limit = PAGE_H - BOTTOM_MARGIN;
    if (currentY + required > limit) {
      doc.addPage();
      const hdr = drawHeader();
      return hdr.contentStartY;
    }
    return currentY;
  };


  // --- Unificación de lógica: general y por agente ---
  // Determinar agentes a mostrar
  let allAgentIds: number[] = [];
  if (opts?.allAgentIds && Array.isArray(opts.allAgentIds) && opts.allAgentIds.length > 0) {
    allAgentIds = [...opts.allAgentIds];
  } else {
    const baseMap = opts?.agentesMap || {};
    const unionIds = new Set<number>();
    Object.keys(baseMap).forEach(id=> unionIds.add(Number(id)));
    if(opts?.perAgentExtended) Object.keys(opts.perAgentExtended).forEach(id=> unionIds.add(Number(id)));
    if(opts?.perAgentActivity) Object.keys(opts.perAgentActivity).forEach(id=> unionIds.add(Number(id)));
    if(opts?.planningSummaries) Object.keys(opts.planningSummaries).forEach(id=> unionIds.add(Number(id)));
    if(opts?.perAgentPrevCounts) Object.keys(opts.perAgentPrevCounts).forEach(id=> unionIds.add(Number(id)));
    if(unionIds.size===0 && prospectos.length){ prospectos.forEach(p=> unionIds.add(p.agente_id)) }
    allAgentIds = Array.from(unionIds.values()).sort((a,b)=> a-b);
  }
  // Si es reporte por agente, filtrar todos los datos y secciones para ese agente
  let agenteId: number | undefined = undefined;
  if (allAgentIds.length === 1) {
    agenteId = allAgentIds[0];
  }
  // --- Datos filtrados ---
  const semanaActual = opts?.semanaActual;
  let actual: Prospecto[] = [];
  let anteriores: Prospecto[] = [];
  if (semanaActual) {
    actual = prospectos.filter(p => p.anio === semanaActual.anio && p.semana_iso === semanaActual.semana_iso);
    anteriores = prospectos.filter(p => !(p.anio === semanaActual.anio && p.semana_iso === semanaActual.semana_iso));
  } else {
    actual = prospectos;
    anteriores = [];
  }
  if (agenteId !== undefined) {
    actual = actual.filter(p => p.agente_id === agenteId);
    anteriores = anteriores.filter(p => p.agente_id === agenteId);
  }
  const agentesMap = opts?.agentesMap || {};
  // --- Renderizar tabla principal de prospectos semana actual ---
  let y = docTyped.lastAutoTable ? docTyped.lastAutoTable.finalY! + GAP + 6 : contentStartY;
  y = ensure(y, 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Prospectos de la semana actual', 14, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const head = [...(opts?.incluirId ? ['ID'] : []), 'Agente', 'Nombre', 'Teléfono', 'Estado', 'Notas'];
  const body: Array<(string|number)[]> = [];
  if (agenteId !== undefined) {
    const agPros = actual;
    if(agPros.length){
      for(const p of agPros){
        body.push([...(opts?.incluirId ? [p.id] : []), agentesMap[agenteId] || agenteId, p.nombre, p.telefono || '', p.estado, (p.notas || '').slice(0, 120)]);
      }
    } else {
      body.push([...(opts?.incluirId ? [''] : []), agentesMap[agenteId] || agenteId, '', '', '', '']);
    }
  } else if (allAgentIds.length > 0) {
    for(const agId of allAgentIds){
      const agPros = actual.filter(p => p.agente_id === agId);
      if(agPros.length){
        for(const p of agPros){
          body.push([...(opts?.incluirId ? [p.id] : []), agentesMap[agId] || agId, p.nombre, p.telefono || '', p.estado, (p.notas || '').slice(0, 120)]);
        }
      } else {
        body.push([...(opts?.incluirId ? [''] : []), agentesMap[agId] || agId, '', '', '', '']);
      }
    }
  } else {
    body.push([...(opts?.incluirId ? [''] : []), 'Sin agentes', '', '', '', '']);
  }
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    styles: {
      fontSize: head.length > 7 ? 6 : 7,
      cellPadding: head.length > 7 ? 1 : 1.5,
      overflow: 'linebreak',
      cellWidth: 'auto',
    },
    headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
    alternateRowStyles: { fillColor: [245, 247, 248] },
    theme: 'grid',
    margin: { left: 18, right: 18 },
    tableWidth: 'wrap',
    didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0) }
  });
  y = docTyped.lastAutoTable!.finalY! + 8;
  // --- Resumen semana actual ---
  const resumenPorEstado = (ps: Prospecto[]) => {
    const pe: Record<string, number> = {};
    for (const p of ps) pe[p.estado] = (pe[p.estado] || 0) + 1;
    return { total: ps.length, por_estado: pe }
  };
  const metaBase = opts?.metaProspectos ?? 30;
  const arrastre = anteriores.length;
  const metaTotal = metaBase + arrastre;
  const rAct = resumenPorEstado(actual);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Resumen semana actual (meta: ${metaTotal})`, 14, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const cards: [string, string][] = [['Prospectos totales', String(rAct.total)]];
  Object.entries(rAct.por_estado).forEach(([k, v]) => {
    cards.push([ESTADO_LABEL[k as ProspectoEstado] || k, String(v)]);
  });
  let cx = 18, cy = y;
  const cardW = 56, cardH = 12;
  cards.forEach((c, i) => {
    doc.setDrawColor(220);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.text(c[0], cx + 3, cy + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(c[1], cx + 3, cy + 10);
    if ((i + 1) % 3 === 0) { cx = 18; cy += cardH + 4 } else { cx += cardW + 6 }
  });
  cy += cardH + 10;
  y = Math.max(y, cy);
  // --- Tabla de arrastre y resumen semanas anteriores ---
  if (anteriores.length) {
    y = docTyped.lastAutoTable ? docTyped.lastAutoTable.finalY! + GAP + 6 : contentStartY + 60;
    y = ensure(y, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Prospectos de semanas anteriores (arrastre)', 14, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const headAnt = [...(opts?.incluirId ? ['ID'] : []), 'Nombre', 'Teléfono', 'Estado', 'Notas', 'Año', 'Semana'];
    const bodyAnt = anteriores.map(p => [...(opts?.incluirId ? [p.id] : []), p.nombre, p.telefono || '', p.estado, (p.notas || '').slice(0, 120), p.anio, p.semana_iso]);
    autoTable(doc, {
      startY: y,
      head: [headAnt],
      body: bodyAnt,
      styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
      alternateRowStyles: { fillColor: [245, 247, 248] },
      theme: 'grid',
      margin: { left: 14, right: 14 },
      didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0) }
    });
    y = docTyped.lastAutoTable!.finalY! + GAP;
    const rAnt = resumenPorEstado(anteriores);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Resumen semanas anteriores', 14, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const cardsAnt: [string, string][] = [['Prospectos arrastre', String(rAnt.total)]];
    Object.entries(rAnt.por_estado).forEach(([k, v]) => {
      cardsAnt.push([ESTADO_LABEL[k as ProspectoEstado] || k, String(v)]);
    });
    let cxAnt = 14, cyAnt = y;
    cardsAnt.forEach((c, i) => {
      doc.setDrawColor(220);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(cxAnt, cyAnt, cardW, cardH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.text(c[0], cxAnt + 3, cyAnt + 5);
      doc.setFont('helvetica', 'normal');
      doc.text(c[1], cxAnt + 3, cyAnt + 10);
      if ((i + 1) % 3 === 0) { cxAnt = 14; cyAnt += cardH + 4 } else { cxAnt += cardW + 6 }
    });
  }

  // --- Secciones avanzadas: métricas, planificación, actividad, acciones ---
  // Usar allAgentIds (siempre contiene solo el agente seleccionado o todos)
  // --- Métricas avanzadas ---
  if (opts?.perAgentExtended && allAgentIds.length > 0) {
    y = ensure(y, 10);
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Métricas avanzadas por agente',14,y); y+=4;
    const head = ['Agente','Conv P->S','Desc %','Proy semana'];
    const body: Array<[string|number, string, string, number|null]> = [];
    for(const agId of allAgentIds){
      const m = opts.perAgentExtended[agId];
      const nombre = (opts.agentesMap||{})[Number(agId)] || agId;
      const conv = m ? (m.conversionPendienteSeguimiento||0)*100 : 0;
      const desc = m ? (m.ratioDescartado||0)*100 : 0;
      const proy = m ? m.forecastSemanaTotal ?? null : null;
      body.push([nombre, conv.toFixed(1)+'%', desc.toFixed(1)+'%', proy]);
    }
    autoTable(doc,{ startY:y, head:[head], body, styles:{fontSize:7, cellPadding:1.5}, headStyles:{ fillColor:[7,46,64], textColor:[255,255,255], fontSize:8 }, theme:'grid', margin:{ left:14, right:14 }, didDrawPage:()=>{ drawHeader(); doc.setTextColor(0,0,0) } });
    y = (docTyped.lastAutoTable?.finalY || y) + 8;
  }

  // --- Planificación semanal resumen ---
  if (opts?.planningSummaries && allAgentIds.length > 0) {
    y = ensure(y, 10);
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Planificación semanal (resumen por agente)',14,y); y+=4;
    const headPlan = ['Agente','Prospección','SMNYL','Total'];
    const body: Array<[string|number, number, number, number]> = [];
    for(const agId of allAgentIds){
      const sum = opts.planningSummaries[agId] || { prospeccion:0, smnyl:0, total:0 };
      body.push([(opts.agentesMap||{})[Number(agId)]||agId, sum.prospeccion, sum.smnyl, sum.total]);
    }
    autoTable(doc,{ startY:y, head:[headPlan], body, styles:{fontSize:7,cellPadding:1.5}, headStyles:{ fillColor:[7,46,64], textColor:[255,255,255], fontSize:8 }, theme:'grid', margin:{ left:14, right:14 }, alternateRowStyles:{ fillColor:[245,247,248] }, didDrawPage:()=>{ drawHeader(); doc.setTextColor(0,0,0) } });
    y = (docTyped.lastAutoTable?.finalY || y) + 8;
  }

  // --- Actividad de la semana (gráfica y tabla) ---
  if (opts?.perAgentActivity && allAgentIds.length > 0) {
    // Unificar labels
    let labels: string[] = [];
    for(const agId of allAgentIds){
      const act = opts.perAgentActivity[agId];
      if(act && act.labels && act.labels.length > 0){ labels = act.labels; break; }
    }
    const aggregated: number[] = Array(labels.length).fill(0);
    for(const agId of allAgentIds){
      const act = opts.perAgentActivity[agId];
      if(act && act.counts){
        act.counts.forEach((c: number, i: number) => { aggregated[i] = (aggregated[i]||0)+c });
      }
    }
    if(labels.length){
      y = ensure(y, 40);
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Actividad total',14,y); y+=4;
      const chartX = 26, chartY = y+2, chartW = 160, chartH = 42;
      const max = Math.max(...aggregated,1);
      doc.setDrawColor(0); doc.setLineWidth(0.2);
      doc.line(chartX, chartY, chartX, chartY+chartH);
      doc.line(chartX, chartY+chartH, chartX+chartW, chartY+chartH);
      let prevX: number | undefined = undefined, prevY: number | undefined = undefined;
      aggregated.forEach((val: number, i: number) => {
        const x = chartX + (chartW/(aggregated.length-1||1))*i;
        const yPt = chartY + chartH - (val/max)*chartH;
        if(prevX!==undefined){ doc.line(prevX, prevY!, x, yPt); }
  doc.setFillColor(0,0,0); try { if(typeof (docTyped as JsPDFWithAutoTable).circle === 'function'){ (docTyped as JsPDFWithAutoTable).circle!(x,yPt,1.2,'F'); } } catch { /* ignore circle error */ }
        prevX = x; prevY = yPt;
      });
      doc.setFontSize(7);
      labels.forEach((l: string, i: number) => { const x = chartX + (chartW/(labels.length-1||1))*i; doc.text(l, x-3, chartY+chartH+6); });
      doc.setFontSize(8); doc.text(String(max), chartX-6, chartY+4);
      y = chartY + chartH + 14;
      // Mostrar tabla por usuario
      const userBody: Array<(string|number)[]> = [];
      for(const agId of allAgentIds){
        const act = opts.perAgentActivity[agId];
        const nombre = (opts.agentesMap||{})[Number(agId)] || agId;
        if(act && act.counts){
          userBody.push([nombre, ...act.counts, act.counts.reduce((a: number, b: number) => a+b, 0)]);
        } else {
          userBody.push([nombre, ...labels.map(()=>0), 0]);
        }
      }
      autoTable(doc,{ startY:y, head:[['Usuario',...labels,'Total']], body:userBody, styles:{fontSize:7,cellPadding:1}, headStyles:{ fillColor:[235,239,241], textColor:[7,46,64], fontSize:8 }, theme:'grid', margin:{ left:14, right:14 }, didDrawPage:()=>{ drawHeader(); doc.setTextColor(0,0,0) } });
      y = (docTyped.lastAutoTable?.finalY || y) + 8;
    }
  }

  // --- Acciones específicas en la semana (detalles por usuario) ---
  if(opts?.perAgentActivity && allAgentIds.length > 0){
    y = (docTyped.lastAutoTable?.finalY||contentStartY) + GAP
    y = ensure(y, 12)
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Acciones específicas en la semana',14,y); y+=4
    const head = ['Usuario','Altas P.','Cambios est.','Notas P.','Edit. planif.','Altas cliente','Modif. cliente','Altas pól.','Modif. pól.']
    const body: Array<[string|number, number, number, number, number, number, number, number, number]> = []
    for(const agId of allAgentIds){
      const act = opts.perAgentActivity[agId];
      const nombre = (opts.agentesMap||{})[Number(agId)] || agId;
      const d = act?.details || { prospectos_altas:0, prospectos_cambios_estado:0, prospectos_notas:0, planificacion_ediciones:0, clientes_altas:0, clientes_modificaciones:0, polizas_altas:0, polizas_modificaciones:0 }
      body.push([nombre, d.prospectos_altas, d.prospectos_cambios_estado, d.prospectos_notas, d.planificacion_ediciones, d.clientes_altas, d.clientes_modificaciones, d.polizas_altas, d.polizas_modificaciones])
    }
    autoTable(doc,{ startY:y, head:[head], body, styles:{fontSize:7,cellPadding:1}, headStyles:{ fillColor:[235,239,241], textColor:[7,46,64], fontSize:8 }, theme:'grid', margin:{ left:14, right:14 }, alternateRowStyles:{ fillColor:[248,250,252] }, didDrawPage:()=>{ drawHeader(); doc.setTextColor(0,0,0) } })
  }


  // Glosario de abreviaturas (siempre al final)
  try {
  let y = docTyped.lastAutoTable ? docTyped.lastAutoTable.finalY! + GAP : contentStartY;
    y = ensure(y, 8)
    doc.setDrawColor(230); doc.line(14, y, 196, y); y += SECTION_GAP
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.text('Glosario de abreviaturas',14,y); doc.setFont('helvetica','normal'); y += 4
    // Contenido del glosario (pares Abrev. - Significado)
    const glossary: Array<[string,string]> = [
      ['SMNYL','Seguros Monterrey New York Life (bloques de actividad SMNYL)'],
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
      ['Clicks','Clicks registrados en la aplicación']
    ]
    const headGloss = ['Abrev.','Significado']
    // Altura mínima para que no se empalme con el footer
    y = ensure(y, 24)
    autoTable(doc, {
      startY: y,
      head: [headGloss],
      body: glossary.map(([k,v])=>[k,v]),
      styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [235,239,241], textColor: [7,46,64], fontSize: 8 },
      theme: 'grid',
      margin: { top: headerHeight + 6, left: 14, right: 14 },
      columnStyles: { 0: { cellWidth: 30, halign: 'left' }, 1: { halign: 'left' } },
      didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
    })
  y = (docTyped.lastAutoTable?.finalY || y) + GAP
  } catch { /* ignore glossary render errors */ }
  // Footer with pagination
  const pageCount: number = docTyped.internal.getNumberOfPages();
  for(let i=1;i<=pageCount;i++){
    docTyped.setPage(i)
    // Footer únicamente (el header ya se dibuja por página en las tablas y cuando se crean páginas manuales)
    docTyped.setFontSize(7); docTyped.setTextColor(120); docTyped.text(`Página ${i}/${pageCount}`, 200, 292, {align:'right'}); docTyped.text('Lealtia',14,292); docTyped.setTextColor(0,0,0)
  }
  // Nombre de archivo dinámico
  const desired = opts?.filename || titulo.replace(/\s+/g,'_').toLowerCase()+'.pdf'
  doc.save(desired)
}
