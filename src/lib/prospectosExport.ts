import type { Prospecto, ProspectoEstado } from '@/types'
import type { ExtendedMetrics, PreviousWeekDelta } from './prospectosMetrics'
import { ESTADO_LABEL } from './prospectosUI'
// import eliminado: fechas de cita dormidas

function pct(part:number,total:number){ if(!total) return '0%'; return ((part/total)*100).toFixed(1)+'%' }
const MX_TZ='America/Mexico_City'
// Colores de barras alineados a Bootstrap (como en UI):
// pendiente -> secondary (gris), seguimiento -> warning (amarillo), con_cita -> success (verde), descartado -> danger (rojo)
const ESTADO_COLORS: Record<ProspectoEstado,string> = {
  pendiente: '#6c757d',
  seguimiento: '#ffc107',
  con_cita: '#198754',
  descartado: '#dc3545',
  ya_es_cliente: '#0dcaf0'
}

// Citas dormidas: evitamos mostrar fechas de cita en tablas
function nowMX(){
  const d=new Date()
  const fecha = new Intl.DateTimeFormat('es-MX',{timeZone:MX_TZ, day:'2-digit', month:'2-digit', year:'numeric'}).format(d)
  const hora = new Intl.DateTimeFormat('es-MX',{timeZone:MX_TZ, hour:'2-digit', minute:'2-digit', hour12:false}).format(d)
  return `${fecha} ${hora}`
}
async function fetchLogoDataUrl(): Promise<string|undefined>{
  // Intenta URL de entorno; fallback a varias rutas en /public
  const candidates: (string|undefined)[] = []
  if(typeof process !== 'undefined') candidates.push(process.env?.NEXT_PUBLIC_MAIL_LOGO_URL, process.env?.MAIL_LOGO_URL)
  // Variantes codificadas y sin codificar (espacios) para mayor tolerancia.
  candidates.push(
    '/Logolealtiaruedablanca.png','/Logolealtiaruedablanca.svg','/Logolealtiaruedablanca.webp',
    '/Logolealtia.png','/Logolealtia.svg','/Logolealtia.webp',
    '/favicon.png','/logo-blanco.png','/logo_white.png',
    '/file.svg','/logo.png','/logo.svg'
  )
  for(const url of candidates.filter(Boolean) as string[]){
    try {
      const resp = await fetch(url)
      if(!resp.ok) continue
      const blob = await resp.blob()
      const b64 = await new Promise<string>((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(String(fr.result)); fr.onerror=reject; fr.readAsDataURL(blob) })
      return b64
    } catch {/* intentar siguiente */}
  }
}

interface ResumenAgente { agente?: string; total:number; por_estado: Record<ProspectoEstado,number> }
type ExtendedProspecto = Prospecto & { agente_id?: number }

export async function exportProspectosPDF(
  prospectos: Prospecto[],
  resumen: { total:number; por_estado: Record<string,number>; cumplimiento_30:boolean },
  titulo: string,
  opts?: {
    incluirId?: boolean;
    agrupadoPorAgente?: boolean;
    agentesMap?: Record<number, string>;
    chartEstados?: boolean;
    metaProspectos?: number;
    forceLogoBlanco?: boolean;
    extendedMetrics?: ExtendedMetrics;
    prevWeekDelta?: PreviousWeekDelta;
    perAgentExtended?: Record<number, ExtendedMetrics>;
    filename?: string;
    perAgentDeltas?: Record<number, { totalDelta: number }>;
    planningSummaries?: Record<number, { prospeccion: number; smnyl: number; total: number }>;
    singleAgentPlanning?: { bloques: Array<{ day: number; hour: string; activity: string; origin?: string; prospecto_nombre?: string; notas?: string }>; summary: { prospeccion: number; smnyl: number; total: number } };
    activityWeekly?: { labels: string[]; counts: number[]; breakdown?: { views: number; clicks: number; forms: number; prospectos: number; planificacion: number; clientes: number; polizas: number; usuarios: number; parametros: number; reportes: number; otros: number }, dailyBreakdown?: Array<{ views: number; clicks: number; forms: number; prospectos: number; planificacion: number; clientes: number; polizas: number; usuarios: number; parametros: number; reportes: number; otros: number }> };
    perAgentActivity?: Record<number, {
      email?: string;
      labels: string[];
      counts: number[];
      breakdown?: {
        views: number;
        clicks: number;
        forms: number;
        prospectos: number;
        planificacion: number;
        clientes: number;
        polizas: number;
        usuarios: number;
        parametros: number;
        reportes: number;
        otros: number;
      };
      details?: {
        prospectos_altas: number;
        prospectos_cambios_estado: number;
        prospectos_notas: number;
        planificacion_ediciones: number;
        clientes_altas: number;
        clientes_modificaciones: number;
        polizas_altas: number;
        polizas_modificaciones: number;
      };
      detailsDaily?: Array<{
        prospectos_altas: number;
        prospectos_cambios_estado: number;
        prospectos_notas: number;
        planificacion_ediciones: number;
        clientes_altas: number;
        clientes_modificaciones: number;
        polizas_altas: number;
        polizas_modificaciones: number;
      }>;
    }>;
    // NUEVO: semana actual y anteriores
    semanaActual?: { anio: number; semana_iso: number };
  }
){
  if(!prospectos.length) return;
  // Cargar jsPDF y registrar el plugin autotable correctamente
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF();
  let logo = await fetchLogoDataUrl();
  let logoW = 0, logoH = 0;
  if(logo){
    try {
      const img = new Image(); img.src = logo;
      await new Promise(res=> { img.onload = res });
      const naturalW = img.width || 1;
      const naturalH = img.height || 1;
      const maxW = 42, maxH = 16; // área disponible en header
      const scale = Math.min(maxW / naturalW, maxH / naturalH, 1);
      logoW = Math.round(naturalW * scale);
      logoH = Math.round(naturalH * scale);
      const canvas = document.createElement('canvas'); canvas.width = naturalW; canvas.height = naturalH;
      const ctx = canvas.getContext('2d');
      if(ctx){
        ctx.drawImage(img,0,0);
        const data = ctx.getImageData(0,0,canvas.width,canvas.height);
        let sum=0, count=0;
        for(let i=0;i<data.data.length;i+=40){ const r=data.data[i], g=data.data[i+1], b=data.data[i+2], a=data.data[i+3]; if(a>10){ sum += (0.299*r + 0.587*g + 0.114*b); count++ } }
        const avg = count? sum/count : 255;
        const needWhite = opts?.forceLogoBlanco || avg < 120;
        if(needWhite){
          for(let i=0;i<data.data.length;i+=4){ if(data.data[i+3] > 10){ data.data[i]=255; data.data[i+1]=255; data.data[i+2]=255 } }
          ctx.putImageData(data,0,0);
          logo = canvas.toDataURL('image/png');
        }
      }
    } catch { /* ignorar problemas de canvas */ }
  }

  // Helpers y layout deben estar definidos antes de renderProspectosPorSemana
  const generadoEn = nowMX();
  // Ajuste dinámico de título para nombres largos de agente
  const drawHeader = ()=>{
    const baseX = logo? 50:12;
    const marginRight = 8;
    const maxWidth = 210 - baseX - marginRight;
    let headerHeight = 22;
    // Calcular líneas del título ajustando tamaño
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
    // Altura requerida: paddingTop(6) + líneas + gap(2) + dateFontSize + paddingBottom(6)
    const neededHeight = 6 + lines.length*lineHeight + 2 + dateFontSize + 6;
    if(neededHeight > headerHeight) headerHeight = neededHeight;
    // Dibujar fondo
    doc.setFillColor(7,46,64); doc.rect(0,0,210,headerHeight,'F');
    // Logo centrado verticalmente
    if(logo && logoW && logoH){ try { doc.addImage(logo,'PNG',10,(headerHeight-logoH)/2,logoW,logoH); } catch {/*ignore*/} } else { doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(255,255,255); doc.text('LOGO', 12, 14); }
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold'); doc.setFontSize(fontSize);
    lines.forEach((l,i)=>{ const baseline = 6 + (i+1)*lineHeight - (lineHeight - fontSize)/2; doc.text(l, baseX, baseline); });
    // Fecha alineada al inicio de la tabla (debajo de título) usando dateFontSize
    const dateY = 6 + lines.length*lineHeight + 2 + dateFontSize;
    doc.setFont('helvetica','normal'); doc.setFontSize(dateFontSize);
    doc.text('Generado (CDMX): '+ generadoEn, baseX, dateY);
    doc.setTextColor(0,0,0);
    const contentStartY = headerHeight + 6; // margen uniforme
    return { headerHeight, contentStartY };
  };
  const { headerHeight, contentStartY } = drawHeader();
  doc.setFontSize(9);
  const GAP = 12; // Espaciado vertical general aumentado
  const SECTION_GAP = 14; // Espaciado entre secciones aumentado
  // Page metrics and helper to avoid drawing content that would be cut at page boundary
  const PAGE_H: number = (doc as unknown as { internal:{ pageSize:{ getHeight:()=>number } } }).internal.pageSize.getHeight();
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

  // --- Nueva lógica: separar prospectos y tablas después de inicializar doc y helpers ---
  function renderProspectosPorSemana() {
    const semanaActual = opts?.semanaActual;
    let actual: Prospecto[] = [];
    let anteriores: Prospecto[] = [];
    if (semanaActual) {
      actual = prospectos.filter(p => p.anio === semanaActual.anio && p.semana_iso === semanaActual.semana_iso);
      anteriores = prospectos.filter(p => !(p.anio === semanaActual.anio && p.semana_iso === semanaActual.semana_iso));
    } else {
      actual = prospectos;
      anteriores = []
    }
    const metaBase = opts?.metaProspectos ?? 30;
    const arrastre = anteriores.length;
    const metaTotal = metaBase + arrastre;
    const resumenPorEstado = (ps: Prospecto[]) => {
      const pe: Record<string, number> = {};
      for (const p of ps) pe[p.estado] = (pe[p.estado] || 0) + 1;
      return { total: ps.length, por_estado: pe }
    };
    if (actual.length) {
      let y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + GAP + 6 : contentStartY;
      y = ensure(y, 10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Prospectos de la semana actual', 14, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const head = [...(opts?.incluirId ? ['ID'] : []), 'Nombre', 'Teléfono', 'Estado', 'Notas'];
      const body = actual.map(p => [...(opts?.incluirId ? [p.id] : []), p.nombre, p.telefono || '', p.estado, (p.notas || '').slice(0, 120)]);
      autoTable(doc, {
        startY: y,
        head: [head],
        body,
        styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
        headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
        alternateRowStyles: { fillColor: [245, 247, 248] },
        theme: 'grid',
        margin: { left: 14, right: 14 },
        didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0) }
      });
      y = (doc as any).lastAutoTable.finalY + 8;
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
      let cx = 14, cy = y;
      const cardW = 56, cardH = 12;
      cards.forEach((c, i) => {
        doc.setDrawColor(220);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.text(c[0], cx + 3, cy + 5);
        doc.setFont('helvetica', 'normal');
        doc.text(c[1], cx + 3, cy + 10);
        if ((i + 1) % 3 === 0) { cx = 14; cy += cardH + 4 } else { cx += cardW + 6 }
      });
      cy += cardH + 10
    }
    if (anteriores.length) {
      let y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + GAP + 6 : contentStartY + 60;
      y = ensure(y, 16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Prospectos de semanas anteriores (arrastre)', 14, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const head = [...(opts?.incluirId ? ['ID'] : []), 'Nombre', 'Teléfono', 'Estado', 'Notas', 'Año', 'Semana'];
      const body = anteriores.map(p => [...(opts?.incluirId ? [p.id] : []), p.nombre, p.telefono || '', p.estado, (p.notas || '').slice(0, 120), p.anio, p.semana_iso]);
      autoTable(doc, {
        startY: y,
        head: [head],
        body,
        styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
        headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
        alternateRowStyles: { fillColor: [245, 247, 248] },
        theme: 'grid',
        margin: { left: 14, right: 14 },
        didDrawPage: () => { drawHeader(); doc.setTextColor(0, 0, 0) }
      });
      y = (doc as any).lastAutoTable.finalY + GAP;
      const rAnt = resumenPorEstado(anteriores);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Resumen semanas anteriores', 14, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const cards: [string, string][] = [['Prospectos arrastre', String(rAnt.total)]];
      Object.entries(rAnt.por_estado).forEach(([k, v]) => {
        cards.push([ESTADO_LABEL[k as ProspectoEstado] || k, String(v)]);
      });
      let cx = 14, cy = y;
      const cardW = 56, cardH = 12;
      cards.forEach((c, i) => {
        doc.setDrawColor(220);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.text(c[0], cx + 3, cy + 5);
        doc.setFont('helvetica', 'normal');
        doc.text(c[1], cx + 3, cy + 10);
        if ((i + 1) % 3 === 0) { cx = 14; cy += cardH + 4 } else { cx += cardW + 6 }
      });
    }
  }
  if (!opts?.agrupadoPorAgente) renderProspectosPorSemana();

  // Glosario de abreviaturas (siempre al final)
  try {
    let y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + GAP : contentStartY;
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
    const withAutoGloss = doc as unknown as { lastAutoTable?: { finalY?: number } }
    y = (withAutoGloss.lastAutoTable?.finalY || y) + GAP
  } catch { /* ignore glossary render errors */ }
  // Footer with pagination
  const pageCount: number = (doc as unknown as { internal:{ getNumberOfPages:()=>number } }).internal.getNumberOfPages()
  for(let i=1;i<=pageCount;i++){
    doc.setPage(i)
    // Footer únicamente (el header ya se dibuja por página en las tablas y cuando se crean páginas manuales)
    doc.setFontSize(7); doc.setTextColor(120); doc.text(`Página ${i}/${pageCount}`, 200, 292, {align:'right'}); doc.text('Lealtia',14,292); doc.setTextColor(0,0,0)
  }
  // Nombre de archivo dinámico
  const desired = opts?.filename || titulo.replace(/\s+/g,'_').toLowerCase()+'.pdf'
  doc.save(desired)
}
