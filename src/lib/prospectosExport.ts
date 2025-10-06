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
  const candidates: (string|undefined)[] = [];
  if(typeof process !== 'undefined') candidates.push(process.env?.NEXT_PUBLIC_MAIL_LOGO_URL, process.env?.MAIL_LOGO_URL);
  candidates.push(
    '/Logolealtiaruedablanca.png','/Logolealtiaruedablanca.svg','/Logolealtiaruedablanca.webp',
    '/Logolealtia.png','/Logolealtia.svg','/Logolealtia.webp'
  );
  // ...resto de la función fetchLogoDataUrl...

  // 4 tarjetas en una fila: ajustar ancho para no exceder 210mm (14 + 4*W + 3*gap <= 210)
  // 4 tarjetas por fila: 4*42 + 3*6 = 186 -> bajamos a 41: 4*41 + 18 = 182
  const cardW=40, cardH=12; let cx=14; let cy=y
        y = ensure(y, cardH + GAP)
        doc.setFontSize(8)
        cardsPlan.forEach((c,i)=>{ doc.setDrawColor(220); doc.setFillColor(248,250,252); doc.roundedRect(cx,cy,cardW,cardH,2,2,'FD'); doc.setFont('helvetica','bold'); doc.text(c[0], cx+3, cy+5); doc.setFont('helvetica','normal'); doc.text(c[1], cx+3, cy+10); if((i+1)%4===0){ cx=14; cy+=cardH+4 } else { cx+=cardW+6 } })
  y = cy + cardH + GAP
        doc.setFontSize(7)
  const headPlan = ['Agente','Prospección','SMNYL','Total']
  autoTable(doc, {
          startY:y,
          head:[headPlan],
          body: Object.entries(opts.planningSummaries).map(([agId,sum])=>[
            agentesMap[Number(agId)]||agId, String(sum.prospeccion), String(sum.smnyl), String(sum.total)
          ]),
          styles:{fontSize:7, cellPadding:1.5}, headStyles:{ fillColor:[7,46,64], fontSize:8 }, theme:'grid',
          margin: { top: headerHeight + 6, left: 14, right: 14 },
          columnStyles: { 1:{ halign:'center' }, 2:{ halign:'center' }, 3:{ halign:'center' }, 4:{ halign:'center' } },
          didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
        })
        const withAuto2 = doc as unknown as { lastAutoTable?: { finalY?: number } }
  y = (withAuto2.lastAutoTable?.finalY || y) + GAP
      }
    }
  // Sección de planificación para reporte individual de agente
  if(!agrupado && opts?.singleAgentPlanning){
    // Ensure space for title + one row of planning cards
    y = ensure(y, 8 + 12 + GAP)
  let y2 = y + 4
    const plan = opts.singleAgentPlanning
    doc.setFontSize(10); doc.text('Planificación semanal',14,y2); y2 += 4
  const cardsPlan: Array<[string,string]> = [ ['Prospección', String(plan.summary.prospeccion)], ['SMNYL', String(plan.summary.smnyl)], ['Total bloques', String(plan.summary.total)] ]
  // 4 tarjetas por fila: usar 41mm para caber en 182mm con 3 gaps de 6mm
  const cardW=40, cardH=12; let cx=14; let cy=y2; doc.setFontSize(8)
    // Ensure cards fit on current page; if not, move and recompute y2
    const rows2 = Math.max(1, Math.ceil(cardsPlan.length/4))
    const requiredCards2 = rows2*cardH + (rows2-1)*4 + GAP
    const ensuredY = ensure(y2, requiredCards2)
    if (ensuredY !== y2) { y2 = ensuredY; cx = 14; cy = y2 }
    cardsPlan.forEach((c,i)=>{ doc.setDrawColor(220); doc.setFillColor(248,250,252); doc.roundedRect(cx,cy,cardW,cardH,2,2,'FD'); doc.setFont('helvetica','bold'); doc.text(c[0], cx+3, cy+5); doc.setFont('helvetica','normal'); doc.text(c[1], cx+3, cy+10); if((i+1)%4===0){ cx=14; cy+=cardH+4 } else { cx+=cardW+6 } })
  cy += cardH + GAP
    const DAY_NAMES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
  const blocksSorted = [...plan.bloques].filter(b=> b.activity !== 'CITAS').sort((a,b)=> a.day===b.day? a.hour.localeCompare(b.hour): a.day-b.day)
  if(blocksSorted.length){
      const headPlan = ['Día','Hora','Actividad','Detalle']
      const bodyPlan = blocksSorted.map(b=> [
        DAY_NAMES[b.day]||String(b.day),
        b.hour+':00',
  b.activity==='PROSPECCION'? 'Prospección': b.activity,
        (b.prospecto_nombre? b.prospecto_nombre: '') + (b.notas? (b.prospecto_nombre? ' - ':'')+ b.notas: '')
      ])
  // Ensure there is sufficient vertical space for at least a few rows before starting the table
      const minTableBlock = 24
      cy = ensure(cy, minTableBlock)
  autoTable(doc, {
        startY: cy,
        head:[headPlan],
        body: bodyPlan,
  styles:{fontSize:7, cellPadding:1, overflow:'linebreak'}, headStyles:{ fillColor:[7,46,64], fontSize:8, textColor:[255,255,255], halign:'center' }, theme:'grid',
  // 20 + 18 + 30 + 114 = 182
  columnStyles: { 0: { cellWidth: 20, halign:'center' }, 1: { cellWidth: 18, halign:'center' }, 2: { cellWidth: 30, halign:'left' }, 3: { cellWidth: 114, overflow:'linebreak', halign:'left' } },
        margin: { top: headerHeight + 6, left: 14, right: 14 },
        didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
      })
      const withAuto = doc as unknown as { lastAutoTable?: { finalY?: number } }
      y2 = (withAuto.lastAutoTable?.finalY || cy) + 4
      y = y2
    } else {
      // Si no hay tabla de bloques, avanzar y debajo de las tarjetas
      y = Math.max(y, cy)
    }
  }
  // Sección: Actividad semanal (solo reporte individual)
  if(!agrupado && opts?.activityWeekly && Array.isArray(opts.activityWeekly.counts) && opts.activityWeekly.counts.length){
    // Dimensiones del bloque
  const chartH = 38
  const xLabelSpace = 10 // espacio para etiquetas del eje X bajo la gráfica
    // Tarjetas de breakdown: 10 ítems, 4 por fila -> 3 filas
    const totalItems = 10
    const perRow = 4
    const rows = Math.ceil(totalItems / perRow)
    const cardH = 10
    const rowGap = 4
    const cardsHeight = rows * cardH + (rows - 1) * rowGap
    // Asegurar espacio total: título (8) + gráfico + etiquetas X + margen entre gráfica y tarjetas (10) + tarjetas + GAP
  // Reservar además el GAP superior para el separador y espacio antes del título
  const required = SECTION_GAP + 8 + chartH + xLabelSpace + 10 + cardsHeight + GAP
  // Forzar salto de página si el espacio libre es menor a 70mm para mantener la sección cohesionada
  const limit = PAGE_H - BOTTOM_MARGIN
  const free = limit - y
  if (free < 70) { doc.addPage(); const hdr = drawHeader(); y = hdr.contentStartY }
  y = ensure(y, required)
  // Separador sutil con el bloque previo, con separación segura
  doc.setDrawColor(230); doc.line(14, y, 196, y); y += SECTION_GAP
  doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.text('Actividad de la semana',14,y); doc.setFont('helvetica','normal'); y += SECTION_GAP
    const labels = opts.activityWeekly.labels || []
    const values = opts.activityWeekly.counts
    const maxV = Math.max(1, ...values)
    const baseX = 14
    const width = 182
    const leftPad = 12
    const rightPad = 6
    const plotX = baseX + leftPad
    const plotW = width - (leftPad + rightPad)
  const plotTop = y + 2 // pequeño padding superior del área de gráfica
  const plotBottom = y + chartH
    // Y axis (simple ticks at 0, max)
    doc.setDrawColor(200)
    doc.line(plotX, plotTop, plotX, plotBottom)
    doc.line(plotX, plotBottom, plotX + plotW, plotBottom)
    doc.setFontSize(7)
  doc.text('0', plotX - 3, plotBottom + 4, { align: 'right' })
    doc.text(String(maxV), plotX - 3, plotTop + 2, { align: 'right' })
    // Polyline
    const n = values.length
    const step = n > 1 ? plotW / (n - 1) : plotW
    // Path color
    doc.setDrawColor(7,46,64)
    let prevX = plotX, prevY = plotBottom - (values[0] / maxV) * chartH
    for (let i = 1; i < n; i++){
      const x = plotX + step * i
      const yVal = plotBottom - (values[i] / maxV) * chartH
      doc.line(prevX, prevY, x, yVal)
      prevX = x; prevY = yVal
    }
    // Draw points
    for (let i = 0; i < n; i++){
      const x = plotX + step * i
      const yVal = plotBottom - (values[i] / maxV) * chartH
      doc.circle(x, yVal, 0.8, 'F')
    }
    // X labels
    for (let i = 0; i < n; i++){
      const x = plotX + step * i
      const label = labels[i] || String(i+1)
  doc.text(label, x, plotBottom + 7, { align: 'center' })
    }
  // Separador sutil bajo la línea base antes de las tarjetas
  doc.setDrawColor(230); doc.line(14, plotBottom + xLabelSpace - 2, 196, plotBottom + xLabelSpace - 2)
  // Tarjetas de desglose (ancho dinámico para respetar márgenes)
  y = plotBottom + xLabelSpace
  if (opts.activityWeekly.breakdown){
      const b = opts.activityWeekly.breakdown
      const items: Array<[string, number]> = [
        ['Vistas', b.views], ['Clicks', b.clicks], ['Formularios', b.forms],
        ['Prospectos', b.prospectos], ['Planificación', b.planificacion], ['Clientes', b.clientes],
        ['Pólizas', b.polizas], ['Usuarios', b.usuarios], ['Parámetros', b.parametros], ['Reportes', b.reportes]
      ]
      const perRow = 4
      const gapX = 6
      const cardH = 10
      const availW = 182
      const cardW = Math.floor((availW - gapX * (perRow - 1)) / perRow)
      let cx = 14, cy = y
      doc.setFontSize(7)
      for (let i = 0; i < items.length; i++){
        const [label, val] = items[i]
        doc.setDrawColor(220); doc.setFillColor(248,250,252)
        doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'FD')
        doc.setFont('helvetica','bold'); doc.text(label, cx + 3, cy + 4)
        doc.setFont('helvetica','normal'); doc.text(String(val), cx + 3, cy + 9)
        if ((i+1) % perRow === 0){ cx = 14; cy += cardH + 4 } else { cx += cardW + gapX }
      }
      y = cy + cardH + GAP
  // Tabla compacta por día con categorías principales (si hay datos)
      if (Array.isArray(opts.activityWeekly.dailyBreakdown) && opts.activityWeekly.dailyBreakdown.length === values.length){
        const head = ['Día','Vistas','Clicks','Forms','Prospectos','Planif.','Clientes','Pólizas','Usuarios']
        const rows = values.map((_, i) => {
          const d = opts.activityWeekly!.dailyBreakdown![i]
          return [labels[i] || String(i+1), String(d.views||0), String(d.clicks||0), String(d.forms||0), String(d.prospectos||0), String(d.planificacion||0), String(d.clientes||0), String(d.polizas||0), String(d.usuarios||0)]
        })
        // Reservar altura mínima de tabla compacta
        y = ensure(y, 24)
  autoTable(doc, {
          startY: y,
          head: [head],
          body: rows,
          styles: { fontSize: 6, cellPadding: 1 }, headStyles: { fillColor: [235,239,241], textColor: [7,46,64], fontSize: 7 }, theme: 'grid',
          margin: { top: headerHeight + 6, left: 14, right: 14 },
          columnStyles: { 0: { halign: 'left' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'center' } },
          didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
        })
        const withAuto = doc as unknown as { lastAutoTable?: { finalY?: number } }
        y = (withAuto.lastAutoTable?.finalY || y) + GAP
      }
      // Bloque adicional: resumen de acciones específicas y tabla diaria detallada (si la API las provee via details/detailsDaily en fetch y se inyectan al exporter más adelante)
      // Notas: Para mantener compatibilidad, este bloque se activa si opts.activityWeekly incluye keys 'details' y 'detailsDaily'
  type ActionDetails = { prospectos_altas:number; prospectos_cambios_estado:number; prospectos_notas:number; planificacion_ediciones:number; clientes_altas:number; clientes_modificaciones:number; polizas_altas:number; polizas_modificaciones:number }
  const anyAW = opts.activityWeekly as unknown as { details?: ActionDetails; detailsDaily?: ActionDetails[] }
      if (anyAW && anyAW.details){
        // Tarjetas resumen (asegurar márgenes seguros y no desbordar)
        const d = anyAW.details as { prospectos_altas:number; prospectos_cambios_estado:number; prospectos_notas:number; planificacion_ediciones:number; clientes_altas:number; clientes_modificaciones:number; polizas_altas:number; polizas_modificaciones:number }
        const items: Array<[string, number]> = [
          ['Altas prospectos', d.prospectos_altas||0],
          ['Cambios de estado', d.prospectos_cambios_estado||0],
          ['Notas en prospectos', d.prospectos_notas||0],
          ['Ediciones planificación', d.planificacion_ediciones||0],
          ['Altas clientes', d.clientes_altas||0],
          ['Cambios clientes', d.clientes_modificaciones||0],
          ['Altas pólizas', d.polizas_altas||0],
          ['Cambios pólizas', d.polizas_modificaciones||0]
        ]
        const perRow2 = 4
        const gapX2 = 6
        const cardH2 = 10
        const availW = 182 // ancho útil entre márgenes 14..196
        const cardW2 = Math.floor((availW - gapX2 * (perRow2 - 1)) / perRow2) // ancho dinámico que cabe en 4 columnas
        const rows2 = Math.ceil(items.length / perRow2)
        const cardsHeight2 = rows2 * cardH2 + (rows2 - 1) * 4
        // Reservar espacio para separador + título + tarjetas + separaciones
        // 1) separador (2) + SECTION_GAP (8) para bajar
        // 2) título (aprox 6-8mm) -> usamos 8
        // 3) tarjetas (cardsHeight2)
        // 4) GAP final
        y = ensure(y, 2 + SECTION_GAP + 8 + cardsHeight2 + GAP)
        // Separador y título como en otras secciones
        doc.setDrawColor(230); doc.line(14, y, 196, y); y += SECTION_GAP
        doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.text('Acciones específicas',14,y); doc.setFont('helvetica','normal'); y += SECTION_GAP
        // Tarjetas
        let cx2 = 14, cy2 = y
        doc.setFontSize(7)
        for (let i = 0; i < items.length; i++){
          const [label, val] = items[i]
          doc.setDrawColor(220); doc.setFillColor(248,250,252)
          doc.roundedRect(cx2, cy2, cardW2, cardH2, 2, 2, 'FD')
          doc.setFont('helvetica','bold'); doc.text(label, cx2 + 3, cy2 + 4)
          doc.setFont('helvetica','normal'); doc.text(String(val), cx2 + 3, cy2 + 9)
          if ((i+1) % perRow2 === 0){ cx2 = 14; cy2 += cardH2 + 4 } else { cx2 += cardW2 + gapX2 }
        }
        y = cy2 + cardH2 + GAP
      }
      if (anyAW && Array.isArray(anyAW.detailsDaily) && anyAW.detailsDaily.length === values.length){
        const head = ['Día','Altas P.','Cambios est.','Notas P.','Edit. planif.','Altas client.','Modif. client.','Altas pól.','Modif. pól.']
        const rows = values.map((_, i) => {
          const d = anyAW.detailsDaily![i] as ActionDetails
          return [labels[i] || String(i+1), String(d.prospectos_altas||0), String(d.prospectos_cambios_estado||0), String(d.prospectos_notas||0), String(d.planificacion_ediciones||0), String(d.clientes_altas||0), String(d.clientes_modificaciones||0), String(d.polizas_altas||0), String(d.polizas_modificaciones||0)]
        })
        // Asegurar altura mínima para que la tabla no se empalme con el footer
        y = ensure(y, 24)
  autoTable(doc, {
          startY: y,
          head: [head],
          body: rows,
          styles: { fontSize: 6, cellPadding: 1 }, headStyles: { fillColor: [235,239,241], textColor: [7,46,64], fontSize: 7 }, theme: 'grid',
          margin: { top: headerHeight + 6, left: 14, right: 14 },
          columnStyles: { 0: { halign: 'left' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'center' } },
          didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
        })
        const withAuto2 = doc as unknown as { lastAutoTable?: { finalY?: number } }
        y = (withAuto2.lastAutoTable?.finalY || y) + GAP
      }
    } else {
      y += GAP
    }
  }
  // En reporte general (agrupado), mostrar "Actividad de la semana" y "Acciones específicas" por usuario
  if(agrupado && opts?.perAgentActivity && Object.keys(opts.perAgentActivity).length){
    // Título de sección general
    y = ensure(y, 8)
    doc.setDrawColor(230); doc.line(14, y, 196, y); y += SECTION_GAP
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.text('Actividad de la semana (por usuario)',14,y); doc.setFont('helvetica','normal'); y += SECTION_GAP
    // Tabla compacta por usuario con total de eventos (suma de counts)
    const head1 = ['Usuario','Total actividad','Views','Clicks','Forms','Prospectos','Planif.','Clientes','Pólizas']
    const rows1: string[][] = Object.entries(opts.perAgentActivity).map(([agId, act])=>{
      const total = Array.isArray(act.counts)? act.counts.reduce((a,b)=>a+b,0) : 0
      const b: { views?:number; clicks?:number; forms?:number; prospectos?:number; planificacion?:number; clientes?:number; polizas?:number } = act.breakdown || {}
      const userLabel = agentesMap[Number(agId)] || act.email || String(agId)
      return [userLabel, String(total), String(b.views||0), String(b.clicks||0), String(b.forms||0), String(b.prospectos||0), String(b.planificacion||0), String(b.clientes||0), String(b.polizas||0)]
    })
    y = ensure(y, 24)
  autoTable(doc, { startY: y, head: [head1], body: rows1, styles: { fontSize: 7, cellPadding: 1 }, headStyles: { fillColor: [235,239,241], textColor: [7,46,64], fontSize: 8 }, theme: 'grid', margin: { top: headerHeight + 6, left: 14, right: 14 }, columnStyles: { 0:{halign:'left'}, 1:{halign:'center'}, 2:{halign:'center'}, 3:{halign:'center'}, 4:{halign:'center'}, 5:{halign:'center'}, 6:{halign:'center'}, 7:{halign:'center'}, 8:{halign:'center'} }, didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) } })
    const withAutoA = doc as unknown as { lastAutoTable?: { finalY?: number } }
    y = (withAutoA.lastAutoTable?.finalY || y) + GAP

    // Gráfica de línea agregada (suma de todos los usuarios)
    try {
      const first = Object.values(opts.perAgentActivity)[0]
      const labelsAgg = (first?.labels && first.labels.length) ? first.labels : ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
      const n = labelsAgg.length
      const countsAgg: number[] = Array.from({length:n}, (_,i)=>{
        let s = 0
        for(const act of Object.values(opts.perAgentActivity!)) s += Number(act.counts?.[i]||0)
        return s
      })
      if(countsAgg.some(v=>v>0)){
        const chartH = 38; const xLabelSpace = 10
        // Si queda poco espacio, pasar a nueva página para mantener cohesión
        const limit = PAGE_H - BOTTOM_MARGIN; const free = limit - y
        if(free < 70){ doc.addPage(); const hdr=drawHeader(); y = hdr.contentStartY }
        // Separador
        doc.setDrawColor(230); doc.line(14, y, 196, y); y += SECTION_GAP
        doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.text('Actividad total',14,y); doc.setFont('helvetica','normal'); y += SECTION_GAP
        const baseX = 14; const width=182; const leftPad=12; const rightPad=6
        const plotX = baseX + leftPad; const plotW = width - (leftPad+rightPad)
        const plotTop = y + 2; const plotBottom = y + chartH
        const maxV = Math.max(1, ...countsAgg)
        // Ejes
        doc.setDrawColor(200)
        doc.line(plotX, plotTop, plotX, plotBottom)
        doc.line(plotX, plotBottom, plotX + plotW, plotBottom)
        doc.setFontSize(7)
        doc.text('0', plotX - 3, plotBottom + 4, { align: 'right' })
        doc.text(String(maxV), plotX - 3, plotTop + 2, { align: 'right' })
        // Línea
        const step = n>1 ? plotW/(n-1) : plotW
        doc.setDrawColor(7,46,64)
        let prevX = plotX, prevY = plotBottom - (countsAgg[0] / maxV) * chartH
        for(let i=1;i<n;i++){
          const x = plotX + step * i
          const yVal = plotBottom - (countsAgg[i] / maxV) * chartH
          doc.line(prevX, prevY, x, yVal)
          prevX = x; prevY = yVal
        }
        for(let i=0;i<n;i++){
          const x = plotX + step * i
          const yVal = plotBottom - (countsAgg[i] / maxV) * chartH
          doc.circle(x, yVal, 0.8, 'F')
        }
        for(let i=0;i<n;i++){
          const x = plotX + step * i
          const label = labelsAgg[i] || String(i+1)
          doc.text(label, x, plotBottom + 7, { align: 'center' })
        }
        // Separador inferior
        doc.setDrawColor(230); doc.line(14, plotBottom + xLabelSpace - 2, 196, plotBottom + xLabelSpace - 2)
        y = plotBottom + xLabelSpace + GAP
      }
    } catch { /* ignore chart errors */ }

    // Tabla por día (por usuario): Usuario, Lun..Dom, Total
    try {
      const headDaily = ['Usuario','Lun','Mar','Mié','Jue','Vie','Sáb','Dom','Total']
      const rowsDaily: string[][] = Object.entries(opts.perAgentActivity).map(([agId, act])=>{
        const userLabel = agentesMap[Number(agId)] || act.email || String(agId)
        const counts = Array.isArray(act.counts) ? act.counts.slice(0,7) : []
        while(counts.length<7) counts.push(0)
        const total = counts.reduce((a,b)=>a+b,0)
        return [userLabel, ...counts.map(c=>String(c)), String(total)]
      })
      // Asegurar espacio mínimo
      y = ensure(y, 24)
  autoTable(doc, { startY: y, head: [headDaily], body: rowsDaily, styles: { fontSize: 7, cellPadding: 1 }, headStyles: { fillColor: [235,239,241], textColor: [7,46,64], fontSize: 8 }, theme: 'grid', margin: { top: headerHeight + 6, left: 14, right: 14 }, columnStyles: { 0:{halign:'left'}, 1:{halign:'center'}, 2:{halign:'center'}, 3:{halign:'center'}, 4:{halign:'center'}, 5:{halign:'center'}, 6:{halign:'center'}, 7:{halign:'center'}, 8:{halign:'center'} }, didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) } })
      const withAutoDaily = doc as unknown as { lastAutoTable?: { finalY?: number } }
      y = (withAutoDaily.lastAutoTable?.finalY || y) + GAP
    } catch { /* ignore daily table errors */ }

    // Segunda sección: Acciones específicas por usuario (tarjetas resumidas en tabla)
    y = ensure(y, 8)
    doc.setDrawColor(230); doc.line(14, y, 196, y); y += SECTION_GAP
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.text('Acciones específicas en la semana',14,y); doc.setFont('helvetica','normal'); y += SECTION_GAP
    const head2 = ['Usuario','Altas P.','Cambios est.','Notas P.','Edit. planif.','Altas cliente','Modif. cliente','Altas pól.','Modif. pól.']
    const rows2: string[][] = Object.entries(opts.perAgentActivity).map(([agId, act])=>{
      const d: { prospectos_altas?:number; prospectos_cambios_estado?:number; prospectos_notas?:number; planificacion_ediciones?:number; clientes_altas?:number; clientes_modificaciones?:number; polizas_altas?:number; polizas_modificaciones?:number } = act.details || {}
      const userLabel = agentesMap[Number(agId)] || act.email || String(agId)
      return [userLabel, String(d.prospectos_altas||0), String(d.prospectos_cambios_estado||0), String(d.prospectos_notas||0), String(d.planificacion_ediciones||0), String(d.clientes_altas||0), String(d.clientes_modificaciones||0), String(d.polizas_altas||0), String(d.polizas_modificaciones||0)]
    })
    y = ensure(y, 24)
  autoTable(doc, { startY: y, head: [head2], body: rows2, styles: { fontSize: 7, cellPadding: 1 }, headStyles: { fillColor: [235,239,241], textColor: [7,46,64], fontSize: 8 }, theme: 'grid', margin: { top: headerHeight + 6, left: 14, right: 14 }, columnStyles: { 0:{halign:'left'}, 1:{halign:'center'}, 2:{halign:'center'}, 3:{halign:'center'}, 4:{halign:'center'}, 5:{halign:'center'}, 6:{halign:'center'}, 7:{halign:'center'}, 8:{halign:'center'} }, didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) } })
    const withAutoB = doc as unknown as { lastAutoTable?: { finalY?: number } }
    y = (withAutoB.lastAutoTable?.finalY || y) + GAP
  }
  // Glosario de abreviaturas (siempre al final)
  try {
    // Separador y título del glosario
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