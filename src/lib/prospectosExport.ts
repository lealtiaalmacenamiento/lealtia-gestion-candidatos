import type { Prospecto, ProspectoEstado } from '@/types'
import type { ExtendedMetrics, PreviousWeekDelta } from './prospectosMetrics'
import { ESTADO_LABEL } from './prospectosUI'
// import eliminado: fechas de cita dormidas

async function loadJSPDF() { return (await import('jspdf')).jsPDF }
async function loadAutoTable() { return (await import('jspdf-autotable')).default }

function pct(part:number,total:number){ if(!total) return '0%'; return ((part/total)*100).toFixed(1)+'%' }
const MX_TZ='America/Mexico_City'
// Colores de barras alineados a Bootstrap (como en UI):
// pendiente -> secondary (gris), seguimiento -> warning (amarillo), con_cita -> success (verde), descartado -> danger (rojo)
const ESTADO_COLORS: Record<ProspectoEstado,string> = {
  pendiente: '#6c757d',
  seguimiento: '#ffc107',
  con_cita: '#198754',
  descartado: '#dc3545'
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
  return
}

interface ResumenAgente { agente?: string; total:number; por_estado: Record<ProspectoEstado,number> }
type ExtendedProspecto = Prospecto & { agente_id?: number }

export async function exportProspectosPDF(
  prospectos: Prospecto[],
  resumen: { total:number; por_estado: Record<string,number>; cumplimiento_30:boolean },
  titulo: string,
  opts?: {
    incluirId?: boolean
    agrupadoPorAgente?: boolean
    agentesMap?: Record<number,string>
    chartEstados?: boolean
  metaProspectos?: number
  forceLogoBlanco?: boolean
  extendedMetrics?: ExtendedMetrics
  prevWeekDelta?: PreviousWeekDelta
  perAgentExtended?: Record<number,ExtendedMetrics>
  filename?: string
  perAgentDeltas?: Record<number,{ totalDelta:number }>
  planningSummaries?: Record<number,{ prospeccion:number; smnyl:number; total:number }>
  singleAgentPlanning?: { bloques: Array<{day:number; hour:string; activity:string; origin?:string; prospecto_nombre?:string; notas?:string}>; summary:{ prospeccion:number; smnyl:number; total:number } }
  // Weekly activity (UI + domain) for line chart in single-agent reports
  activityWeekly?: { labels: string[]; counts: number[]; breakdown?: { views:number; clicks:number; forms:number; prospectos:number; planificacion:number; clientes:number; polizas:number; usuarios:number; parametros:number; reportes:number; otros:number }, dailyBreakdown?: Array<{ views:number; clicks:number; forms:number; prospectos:number; planificacion:number; clientes:number; polizas:number; usuarios:number; parametros:number; reportes:number; otros:number }> }
  // Per-agent weekly activity for grouped (general) reports
  perAgentActivity?: Record<number,{ email?:string; labels:string[]; counts:number[]; breakdown?: { views:number; clicks:number; forms:number; prospectos:number; planificacion:number; clientes:number; polizas:number; usuarios:number; parametros:number; reportes:number; otros:number }; details?: { prospectos_altas:number; prospectos_cambios_estado:number; prospectos_notas:number; planificacion_ediciones:number; clientes_altas:number; clientes_modificaciones:number; polizas_altas:number; polizas_modificaciones:number } }>
  }
){
  if(!prospectos.length) return
  const jsPDF = await loadJSPDF(); await loadAutoTable()
  const doc = new jsPDF()
  let logo = await fetchLogoDataUrl()
  let logoW = 0, logoH = 0
  if(logo){
    try {
      const img = new Image(); img.src = logo
      await new Promise(res=> { img.onload = res })
      const naturalW = img.width || 1
      const naturalH = img.height || 1
      const maxW = 42, maxH = 16 // área disponible en header
      const scale = Math.min(maxW / naturalW, maxH / naturalH, 1)
      logoW = Math.round(naturalW * scale)
      logoH = Math.round(naturalH * scale)
      const canvas = document.createElement('canvas'); canvas.width = naturalW; canvas.height = naturalH
      const ctx = canvas.getContext('2d')
      if(ctx){
        ctx.drawImage(img,0,0)
        const data = ctx.getImageData(0,0,canvas.width,canvas.height)
        let sum=0, count=0
        for(let i=0;i<data.data.length;i+=40){ const r=data.data[i], g=data.data[i+1], b=data.data[i+2], a=data.data[i+3]; if(a>10){ sum += (0.299*r + 0.587*g + 0.114*b); count++ } }
        const avg = count? sum/count : 255
        const needWhite = opts?.forceLogoBlanco || avg < 120
        if(needWhite){
          for(let i=0;i<data.data.length;i+=4){ if(data.data[i+3] > 10){ data.data[i]=255; data.data[i+1]=255; data.data[i+2]=255 } }
          ctx.putImageData(data,0,0)
          logo = canvas.toDataURL('image/png')
        }
      }
    } catch { /* ignorar problemas de canvas */ }
  }
  const generadoEn = nowMX()
  // Ajuste dinámico de título para nombres largos de agente
  const drawHeader = ()=>{
    const baseX = logo? 50:12
    const marginRight = 8
    const maxWidth = 210 - baseX - marginRight
    let headerHeight = 22
    // Calcular líneas del título ajustando tamaño
    let fontSize = 13
    doc.setFont('helvetica','bold')
    let width = 0
    while(fontSize>=8){ doc.setFontSize(fontSize); width = doc.getTextWidth(titulo); if(width <= maxWidth) break; fontSize-- }
    let lines: string[] = []
    if(width > maxWidth){
      const words = titulo.split(/\s+/)
      let current = ''
      words.forEach(w=>{ const test = current? current+' '+w: w; const testW = doc.getTextWidth(test); if(testW <= maxWidth) current=test; else { if(current) lines.push(current); current=w } })
      if(current) lines.push(current)
    } else lines = [titulo]
    while(lines.length > 3 && fontSize > 7){ fontSize--; doc.setFontSize(fontSize); const words = titulo.split(/\s+/); lines=[]; let current=''; words.forEach(w=>{ const test = current? current+' '+w: w; const testW = doc.getTextWidth(test); if(testW <= maxWidth) current=test; else { if(current) lines.push(current); current=w } }); if(current) lines.push(current) }
    const lineHeight = fontSize + 2
    const dateFontSize = 8
    // Altura requerida: paddingTop(6) + líneas + gap(2) + dateFontSize + paddingBottom(6)
    const neededHeight = 6 + lines.length*lineHeight + 2 + dateFontSize + 6
    if(neededHeight > headerHeight) headerHeight = neededHeight
    // Dibujar fondo
    doc.setFillColor(7,46,64); doc.rect(0,0,210,headerHeight,'F')
    // Logo centrado verticalmente
    if(logo && logoW && logoH){ try { doc.addImage(logo,'PNG',10,(headerHeight-logoH)/2,logoW,logoH) } catch {/*ignore*/} } else { doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(255,255,255); doc.text('LOGO', 12, 14) }
    doc.setTextColor(255,255,255)
  doc.setFont('helvetica','bold'); doc.setFontSize(fontSize)
    lines.forEach((l,i)=>{ const baseline = 6 + (i+1)*lineHeight - (lineHeight - fontSize)/2; doc.text(l, baseX, baseline) })
    // Fecha alineada al inicio de la tabla (debajo de título) usando dateFontSize
    const dateY = 6 + lines.length*lineHeight + 2 + dateFontSize
    doc.setFont('helvetica','normal'); doc.setFontSize(dateFontSize)
    doc.text('Generado (CDMX): '+ generadoEn, baseX, dateY)
    doc.setTextColor(0,0,0)
    const contentStartY = headerHeight + 6 // margen uniforme
    return { headerHeight, contentStartY }
  }
  const { headerHeight, contentStartY } = drawHeader()
  doc.setFontSize(9)
  const GAP = 6
  const SECTION_GAP = 8
  // Page metrics and helper to avoid drawing content that would be cut at page boundary
  const PAGE_H: number = (doc as unknown as { internal:{ pageSize:{ getHeight:()=>number } } }).internal.pageSize.getHeight()
  const BOTTOM_MARGIN = 14
  const ensure = (currentY:number, required:number) => {
    const limit = PAGE_H - BOTTOM_MARGIN
    if (currentY + required > limit) {
      doc.addPage()
      const hdr = drawHeader()
      return hdr.contentStartY
    }
    return currentY
  }
  const incluirId = opts?.incluirId
  const agrupado = opts?.agrupadoPorAgente
  const agentesMap = opts?.agentesMap || {}
  let metaProspectos = opts?.metaProspectos ?? 30
  const distinctAgentsCount = agrupado ? new Set(prospectos.map(p=> (p as ExtendedProspecto).agente_id)).size || 1 : 1
  if(agrupado){
    metaProspectos = metaProspectos * distinctAgentsCount
  }
  let y = contentStartY
  if(!agrupado){
  const head = [ ...(incluirId? ['ID']: []), 'Nombre','Teléfono','Estado','Notas' ]
  const body = prospectos.map(p=> [ ...(incluirId? [p.id]: []), p.nombre, p.telefono||'', p.estado, (p.notas||'').slice(0,120) ])
    const tableStartY = contentStartY
    // @ts-expect-error autotable plugin
    doc.autoTable({
      startY: tableStartY,
      head: [head],
      body,
  styles:{ fontSize:7, cellPadding:1.5, overflow:'linebreak' },
      headStyles:{ fillColor:[7,46,64], fontSize:8, textColor:[255,255,255], halign:'center' },
      alternateRowStyles:{ fillColor:[245,247,248] },
      theme:'grid',
      // Ajuste de anchos: considerar desplazamiento si se incluye ID
  columnStyles: (()=>{ const s: Record<number,{ cellWidth?: number; halign?: 'left'|'center'|'right'; overflow?: 'linebreak'|'ellipsize'|'visible' }> = {}; let base=0; if(incluirId) { s[0]={ cellWidth: 12, halign:'center' } ; base=1 }
  // Total 182mm: 48 + 28 + 24 + 82 = 182 (aprox)
  s[base+0] = { cellWidth: 48, halign:'left' } // Nombre
  s[base+1] = { cellWidth: 28, halign:'center' } // Teléfono
  s[base+2] = { cellWidth: 24, halign:'center' } // Estado
  s[base+3] = { cellWidth: 82, overflow:'linebreak', halign:'left' } // Notas
        return s })(),
      margin: { top: headerHeight + 6, left: 14, right: 14 },
      didDrawPage: () => {
        // Redibujar encabezado por página de la tabla
        drawHeader()
        doc.setTextColor(0,0,0)
      }
    })
    interface DocMaybeAuto { lastAutoTable?: { finalY?: number } }
    const docWith = doc as unknown as DocMaybeAuto
    y = (docWith.lastAutoTable?.finalY || tableStartY) + GAP
  }
  doc.setFontSize(10)
  // Ensure space for the section title
  y = ensure(y, 8)
  doc.setFont('helvetica','bold'); doc.text(agrupado? 'Resumen por agente':'Resumen',14,y); doc.setFont('helvetica','normal')
  y += 4
  if(!agrupado){
    // Summary cards (2 columns)
    const cards: Array<[string,string]> = [
      ['Prospectos totales', String(resumen.total)],
      ['Pendiente', `${resumen.por_estado.pendiente||0} (${pct(resumen.por_estado.pendiente||0,resumen.total)})`],
      ['Seguimiento', `${resumen.por_estado.seguimiento||0} (${pct(resumen.por_estado.seguimiento||0,resumen.total)})`],
      ['Con cita', `${resumen.por_estado.con_cita||0} (${pct(resumen.por_estado.con_cita||0,resumen.total)})`],
      ['Descartado', `${resumen.por_estado.descartado||0} (${pct(resumen.por_estado.descartado||0,resumen.total)})`],
      ['Cumplimiento 30', resumen.cumplimiento_30? 'SI':'NO']
    ]
    // 3 tarjetas por fila dentro de 182mm útiles: 3*56 + 2*6 = 180 <= 182
    const cardW = 56; const cardH=12; let cx=14; let cy=y
    // Ensure space for the rows of cards
    const rows = Math.max(1, Math.ceil(cards.length/3))
    const requiredCards = rows*cardH + (rows-1)*4 + GAP
    y = ensure(y, requiredCards)
    doc.setFontSize(8)
    cards.forEach((c,i)=>{ doc.setDrawColor(220); doc.setFillColor(248,250,252); doc.roundedRect(cx,cy,cardW,cardH,2,2,'FD'); doc.setFont('helvetica','bold'); doc.text(c[0], cx+3, cy+5); doc.setFont('helvetica','normal'); doc.text(c[1], cx+3, cy+10);
      if((i+1)%3===0){ cx=14; cy+=cardH+4 } else { cx+=cardW+6 } })
  y = cy + cardH + GAP
  if(opts?.chartEstados){
    // Simple bar chart for estados con leyenda
    // Ensure space for legend + chart + progress bar block
    const legendH = 10
    const requiredChart = (46 + legendH) /* chartHeight + legend */ + 14 /* progress */ + 12 /* spacing */
    y = ensure(y, requiredChart)
    const chartY = y + 4
      const dataEntries: Array<[string, number, string]> = [
        ['pendiente', resumen.por_estado.pendiente||0, ESTADO_COLORS.pendiente],
        ['seguimiento', resumen.por_estado.seguimiento||0, ESTADO_COLORS.seguimiento],
        ['con_cita', resumen.por_estado.con_cita||0, ESTADO_COLORS.con_cita],
        ['descartado', resumen.por_estado.descartado||0, ESTADO_COLORS.descartado]
      ]
    const maxV = Math.max(1,...dataEntries.map(d=>d[1]))
      const baseX = 14
      const barW = 16
      const gap = 6
    const legendGap = 6
    const barsTop = chartY + legendH + legendGap
    const baseY = barsTop + 30
      // Legend (horizontal)
      doc.setFontSize(7)
  let lx = baseX; const ly = chartY + 6
      const itemW = 36
  dataEntries.forEach(([key, , color]) => {
        const hex = color.startsWith('#')? color.substring(1): color
        const r = parseInt(hex.substring(0,2),16)
        const g = parseInt(hex.substring(2,4),16)
        const b = parseInt(hex.substring(4,6),16)
        doc.setFillColor(r,g,b)
        doc.rect(lx, ly - 3, 4, 4, 'F')
        doc.setTextColor(0,0,0)
        const label = ESTADO_LABEL[key as ProspectoEstado] || key.replace('_',' ')
        doc.text(label, lx + 6, ly)
        lx += itemW
      })
      doc.setFontSize(8)
  dataEntries.forEach((d,i)=>{
        const [key,val,color] = d
        const h = (val/maxV)*30
        const x = baseX + i*(barW+gap)
    const yBar = baseY - h
        // color fill
  // color in hex -> convert to rgb
  const hex = color.startsWith('#')? color.substring(1): color
  const r = parseInt(hex.substring(0,2),16)
  const g = parseInt(hex.substring(2,4),16)
  const b = parseInt(hex.substring(4,6),16)
  doc.setFillColor(r,g,b)
        doc.rect(x, yBar, barW, h, 'F')
        doc.text(String(val), x+barW/2, yBar-3, {align:'center'})
        const label = ESTADO_LABEL[key as ProspectoEstado] || key.replace('_',' ')
        doc.text(label, x+barW/2, barsTop + 32, {align:'center'})
      })
  y = baseY + GAP + 2
      // Añadir progreso contra metas debajo del chart
      // Progreso Prospectos
  const progY = y
  // Separador horizontal entre gráfica y barra de progreso (no agrupado)
  doc.setDrawColor(230); doc.line(14, progY - 2, 196, progY - 2)
      const drawProgress = (label:string, val:number, meta:number, pxY:number)=>{
        const pctVal = meta? Math.min(1, val/meta): 0
        const barWTotal = 80; const barH = 6
        doc.setFontSize(7); doc.text(`${label}: ${val}/${meta}`, baseX, pxY-1)
        doc.setDrawColor(200); doc.rect(baseX, pxY, barWTotal, barH)
        doc.setFillColor(7,46,64); doc.rect(baseX, pxY, barWTotal*pctVal, barH, 'F')
        doc.setTextColor(255,255,255); doc.text(Math.round(pctVal*100)+'%', baseX+barWTotal/2, pxY+barH-1, {align:'center'}); doc.setTextColor(0,0,0)
      }
  drawProgress('Meta prospectos', resumen.total, metaProspectos, progY+2)
  // Más espacio tras barra de progreso para separar del siguiente bloque
      y += 14
    }
    // Métricas avanzadas (agente individual) debajo del bloque anterior para evitar sobreposición
    if(opts?.extendedMetrics){
      const em = opts.extendedMetrics
      // Línea separadora sutil y extra espacio antes del título
      // Ensure room for a separator and section heading
      y = ensure(y, 10)
      doc.setDrawColor(230); doc.line(14, y, 196, y); y += 4
      doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.text('Métricas avanzadas',14,y)
      y += 4; doc.setFontSize(7); doc.setFont('helvetica','normal')
  // Secciones relacionadas con citas dormidas (citas por hora, riesgo seguimiento sin cita) no se incluyen
      // Tabla compacta de métricas clave
      const includeDelta = !!opts?.prevWeekDelta
      const header = ['Conv P->S','Desc %','Proy semana', ...(includeDelta? ['Prospectos vs semana anterior']: []) ]
      const row = [
        (em.conversionPendienteSeguimiento*100).toFixed(1)+'%',
        (em.ratioDescartado*100).toFixed(1)+'%',
        em.forecastSemanaTotal!=null? String(em.forecastSemanaTotal):'-',
        ...(includeDelta? [ (opts.prevWeekDelta!.totalDelta>=0? '+':'')+String(opts.prevWeekDelta!.totalDelta) ]: [])
      ]
      // @ts-expect-error autotable
  doc.autoTable({
        startY: y+2,
        head:[header],
        body:[row],
    styles:{fontSize:7, cellPadding:1},
        headStyles:{fillColor:[7,46,64]},
  theme:'grid',
  margin: { top: headerHeight + 6, left: 14, right: 14 },
  columnStyles: { 0:{ halign:'center' }, 1:{ halign:'center' }, 2:{ halign:'center' }, 3:{ halign:'center' }, 4:{ halign:'center' } },
  didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
      })
      const withAuto = doc as unknown as { lastAutoTable?: { finalY?: number } }
  y = (withAuto.lastAutoTable?.finalY || y) + GAP
    }
  } else {
    // Reporte agrupado
    // Tabla resumen por agente
    const porAgente: Record<string,ResumenAgente> = {}
    for(const p of prospectos){
      const ep = p as ExtendedProspecto
      const agName = agentesMap[ep.agente_id ?? -1] || `Ag ${ ep.agente_id}`
      if(!porAgente[agName]) porAgente[agName] = { agente: agName, total:0, por_estado:{ pendiente:0, seguimiento:0, con_cita:0, descartado:0 } }
      const bucket = porAgente[agName]
      bucket.total++
      if(bucket.por_estado[p.estado] !== undefined) bucket.por_estado[p.estado]++
    }
    const includeAgentDeltaResumen = !!opts?.perAgentDeltas
    const head2 = ['Agente','Total','Pendiente','Seguimiento','Con cita','Descartado', ...(includeAgentDeltaResumen? ['Prospectos vs semana anterior']: [])]
    const body2 = Object.entries(porAgente).map(([agNameKey, r])=> {
      const agId = Object.entries(agentesMap).find(([,name])=> name===agNameKey)?.[0]
      const deltas = includeAgentDeltaResumen && agId? opts?.perAgentDeltas?.[Number(agId)] : undefined
      return [
        r.agente,
        r.total,
        r.por_estado.pendiente,
        r.por_estado.seguimiento,
        r.por_estado.con_cita,
        r.por_estado.descartado,
  ...(includeAgentDeltaResumen? [ deltas? (deltas.totalDelta>=0? '+'+deltas.totalDelta: String(deltas.totalDelta)):'-' ]: [])
      ]
    })
    // Totales al final
    const totals = Object.values(porAgente).reduce((acc, r)=>{
      acc.total += r.total
      acc.pendiente += r.por_estado.pendiente
      acc.seguimiento += r.por_estado.seguimiento
      acc.con_cita += r.por_estado.con_cita || 0
      acc.descartado += r.por_estado.descartado
      return acc
    }, { total:0, pendiente:0, seguimiento:0, con_cita:0, descartado:0 })
    const footerRows = [ [
      'TOTAL',
      totals.total,
      totals.pendiente,
      totals.seguimiento,
  totals.con_cita,
      totals.descartado,
  ...(includeAgentDeltaResumen? ['']: [])
    ] ]
  // @ts-expect-error autotable plugin
      doc.autoTable({
    startY:y,
    head:[head2],
    body:body2,
  styles:{fontSize:7, cellPadding:1},
  headStyles:{ fillColor:[7,46,64], fontSize:8 },
  alternateRowStyles:{ fillColor:[245,247,248] },
  theme:'grid',
  margin: { top: headerHeight + 6, left: 14, right: 14 },
  // Alinear: "Agente" a la izquierda, el resto centrado (incluyendo columnas delta si existen)
  columnStyles: { 0:{ halign:'left' }, 1:{ halign:'center' }, 2:{ halign:'center' }, 3:{ halign:'center' }, 4:{ halign:'center' }, 5:{ halign:'center' }, 6:{ halign:'center' }, 7:{ halign:'center' } },
  foot: footerRows,
  footStyles:{ fillColor:[235,239,241], textColor:[7,46,64], fontStyle:'bold' },
  didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
  })
    const afterResumenTable = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y
    y = afterResumenTable + GAP
    // Global charts if requested (agrupado scenario)
    if(opts?.chartEstados){
      // Ensure space for chart + progress bar + cards block on grouped report
    const legendH = 10
    const requiredChartAgg = (46 + legendH) /* chart + legend */ + 14 /* progress */ + 16 /* spacing */ + 4
      y = ensure(y, requiredChartAgg)
      const chartTop = y
      const baseX = 14
  const barW = 16
  const barGap = 6
    const chartHeight = 46 + legendH // altura destino (30 barras + labels + margen + leyenda)
      const dataEntries: Array<[string, number, string]> = [
        ['pendiente', resumen.por_estado.pendiente||0, ESTADO_COLORS.pendiente],
        ['seguimiento', resumen.por_estado.seguimiento||0, ESTADO_COLORS.seguimiento],
        ['con_cita', resumen.por_estado.con_cita||0, ESTADO_COLORS.con_cita],
        ['descartado', resumen.por_estado.descartado||0, ESTADO_COLORS.descartado]
      ]
      const maxV = Math.max(1,...dataEntries.map(d=>d[1]))
      // Legend (horizontal)
      doc.setFontSize(7)
  let lx = baseX; const ly = chartTop + 6
      const itemW = 36
  dataEntries.forEach(([key, , color]) => {
        const hex = color.replace('#','')
        const r=parseInt(hex.substring(0,2),16), g=parseInt(hex.substring(2,4),16), b=parseInt(hex.substring(4,6),16)
        doc.setFillColor(r,g,b)
        doc.rect(lx, ly - 3, 4, 4, 'F')
        const label = ESTADO_LABEL[key as ProspectoEstado] || key.replace('_',' ')
        doc.setTextColor(0,0,0)
        doc.text(label, lx + 6, ly)
        lx += itemW
      })
      doc.setFontSize(8)
      dataEntries.forEach((d,i)=>{
        const [key,val,color] = d
  const h = (val/maxV)*30
  const x = baseX + i*(barW+barGap)
  const legendGap = 6
  const barsTop = chartTop + legendH + legendGap
  const yBar = barsTop + 30 - h
        const hex = color.replace('#','')
        const r=parseInt(hex.substring(0,2),16), g=parseInt(hex.substring(2,4),16), b=parseInt(hex.substring(4,6),16)
        doc.setFillColor(r,g,b)
  doc.rect(x,yBar,barW,h,'F')
  // Value label above bar with a bit more padding
  doc.text(String(val), x+barW/2, yBar-3, {align:'center'})
        const label = ESTADO_LABEL[key as ProspectoEstado] || key.replace('_',' ')
  // Category label under bars area
  doc.text(label, x+barW/2, barsTop + 32, {align:'center'})
      })
  // Progresos bajo chart
  const progressTop = chartTop + chartHeight
  // Separador horizontal entre gráfica y progreso
  doc.setDrawColor(230); doc.line(14, progressTop - 2, 196, progressTop - 2)
      const drawProgress = (label:string, val:number, meta:number, lineY:number)=>{
        const pctVal = meta? Math.min(1,val/meta):0
        const totalW=80, h=6
        doc.setFontSize(7); doc.text(`${label}: ${val}/${meta}`, baseX, lineY-1)
        doc.setDrawColor(200); doc.rect(baseX, lineY, totalW, h)
        doc.setFillColor(7,46,64); doc.rect(baseX, lineY, totalW*pctVal, h, 'F')
        doc.setTextColor(255,255,255); doc.text(Math.round(pctVal*100)+'%', baseX+totalW/2, lineY+h-1, {align:'center'}); doc.setTextColor(0,0,0)
      }
  drawProgress('Meta prospectos', resumen.total, metaProspectos, progressTop+2)
  const chartBlockBottom = progressTop + 14
  // Cards a la derecha
      const cards: Array<[string,string]> = [
        ['Total', String(resumen.total)],
        ['Pendiente', `${resumen.por_estado.pendiente||0} (${pct(resumen.por_estado.pendiente||0,resumen.total)})`],
        ['Seguimiento', `${resumen.por_estado.seguimiento||0} (${pct(resumen.por_estado.seguimiento||0,resumen.total)})`],
        ['Con cita', `${resumen.por_estado.con_cita||0} (${pct(resumen.por_estado.con_cita||0,resumen.total)})`],
        ['Descartado', `${resumen.por_estado.descartado||0} (${pct(resumen.por_estado.descartado||0,resumen.total)})`]
      ]
      const cardX = 110
      let cardY = chartTop
      const cardW = 80, cardH = 12
      doc.setFontSize(8)
  cards.forEach(c=>{ doc.setDrawColor(220); doc.setFillColor(248,250,252); doc.roundedRect(cardX,cardY,cardW,cardH,2,2,'FD'); doc.setFont('helvetica','bold'); doc.text(c[0], cardX+3, cardY+5); doc.setFont('helvetica','normal'); doc.text(c[1], cardX+3, cardY+10); cardY += cardH+4 })
  // Separador vertical sutil entre la gráfica (izquierda) y las tarjetas (derecha)
  const vX = cardX - 6; doc.setDrawColor(230); doc.line(vX, chartTop, vX, Math.max(chartBlockBottom, cardY))
  // Añadir más espacio antes del siguiente bloque para que 'Métricas avanzadas' no quede pegado
  y = Math.max(chartBlockBottom, cardY) + GAP + 12
    }
  // Métricas por agente agrupado
      if(opts?.perAgentExtended){
        y = ensure(y, 10)
        doc.setFontSize(10); doc.text('Métricas avanzadas por agente',14,y); y+=4
        doc.setFontSize(7)
  const includeAgentDelta = !!opts?.perAgentDeltas
  const header = ['Agente','Conv P->S','Desc %','Proy semana', ...(includeAgentDelta? ['Prospectos vs semana anterior']: [])]
        // @ts-expect-error autotable plugin
  doc.autoTable({
          startY: y,
          head:[header],
          body: Object.entries(opts.perAgentExtended).map(([agId, em])=>{
            const agName = agentesMap[Number(agId)] || agId
            const deltas = includeAgentDelta? opts.perAgentDeltas?.[Number(agId)] : undefined
            return [
              agName,
              (em.conversionPendienteSeguimiento*100).toFixed(1)+'%',
              (em.ratioDescartado*100).toFixed(1)+'%',
              em.forecastSemanaTotal!=null? String(em.forecastSemanaTotal):'-',
              ...(includeAgentDelta? [ deltas? (deltas.totalDelta>=0? '+':'')+deltas.totalDelta : '-' ]: [])
            ]
          }),
          styles:{fontSize:7, cellPadding:1.5}, headStyles:{ fillColor:[7,46,64], fontSize:8 }, theme:'grid',
          margin: { top: headerHeight + 6, left: 14, right: 14 },
          columnStyles: { 1:{ halign:'center' }, 2:{ halign:'center' }, 3:{ halign:'center' }, 4:{ halign:'center' } },
          didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
        })
        const withAuto = doc as unknown as { lastAutoTable?: { finalY?: number } }
  y = (withAuto.lastAutoTable?.finalY || y) + GAP
      }

      // Resumen de planificación semanal por agente (si se proporcionó)
      if(opts?.planningSummaries){
        const totalAgg = Object.values(opts.planningSummaries).reduce((acc,cur)=>{ acc.prospeccion+=cur.prospeccion; acc.smnyl+=cur.smnyl; acc.total+=cur.total; return acc },{prospeccion:0,smnyl:0,total:0})
        // Asegurar espacio para título + tarjetas resumen
        y = ensure(y, 8 + 12 + GAP)
        doc.setFontSize(10); doc.text('Planificación semanal (resumen y detalle por agente)',14,y); y+=4
        // Tarjetas resumen total
        const cardsPlan: Array<[string,string]> = [
          ['Prospección', String(totalAgg.prospeccion)],
          ['SMNYL', String(totalAgg.smnyl)],
          ['Total bloques', String(totalAgg.total)]
        ]
  // 4 tarjetas en una fila: ajustar ancho para no exceder 210mm (14 + 4*W + 3*gap <= 210)
  // 4 tarjetas por fila: 4*42 + 3*6 = 186 -> bajamos a 41: 4*41 + 18 = 182
  const cardW=40, cardH=12; let cx=14; let cy=y
        y = ensure(y, cardH + GAP)
        doc.setFontSize(8)
        cardsPlan.forEach((c,i)=>{ doc.setDrawColor(220); doc.setFillColor(248,250,252); doc.roundedRect(cx,cy,cardW,cardH,2,2,'FD'); doc.setFont('helvetica','bold'); doc.text(c[0], cx+3, cy+5); doc.setFont('helvetica','normal'); doc.text(c[1], cx+3, cy+10); if((i+1)%4===0){ cx=14; cy+=cardH+4 } else { cx+=cardW+6 } })
  y = cy + cardH + GAP
        doc.setFontSize(7)
  const headPlan = ['Agente','Prospección','SMNYL','Total']
        // @ts-expect-error autotable
        doc.autoTable({
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
  // @ts-expect-error autotable
      doc.autoTable({
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
        // @ts-expect-error autotable
        doc.autoTable({
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
        // Asegurar altura mínima para que la tabla no se empalme con el título o tarjetas
        y = ensure(y, 24)
        // @ts-expect-error autotable
        doc.autoTable({
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
    // @ts-expect-error autotable
    doc.autoTable({ startY: y, head: [head1], body: rows1, styles: { fontSize: 7, cellPadding: 1 }, headStyles: { fillColor: [235,239,241], textColor: [7,46,64], fontSize: 8 }, theme: 'grid', margin: { top: headerHeight + 6, left: 14, right: 14 }, columnStyles: { 0:{halign:'left'}, 1:{halign:'center'}, 2:{halign:'center'}, 3:{halign:'center'}, 4:{halign:'center'}, 5:{halign:'center'}, 6:{halign:'center'}, 7:{halign:'center'}, 8:{halign:'center'} }, didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) } })
    const withAutoA = doc as unknown as { lastAutoTable?: { finalY?: number } }
    y = (withAutoA.lastAutoTable?.finalY || y) + GAP

    // Segunda sección: Acciones específicas por usuario (tarjetas resumidas en tabla)
    y = ensure(y, 8)
    doc.setDrawColor(230); doc.line(14, y, 196, y); y += SECTION_GAP
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.text('Acciones específicas (por usuario)',14,y); doc.setFont('helvetica','normal'); y += SECTION_GAP
    const head2 = ['Usuario','Altas P.','Cambios est.','Notas P.','Edit. planif.','Altas cliente','Modif. cliente','Altas pól.','Modif. pól.']
    const rows2: string[][] = Object.entries(opts.perAgentActivity).map(([agId, act])=>{
      const d: { prospectos_altas?:number; prospectos_cambios_estado?:number; prospectos_notas?:number; planificacion_ediciones?:number; clientes_altas?:number; clientes_modificaciones?:number; polizas_altas?:number; polizas_modificaciones?:number } = act.details || {}
      const userLabel = agentesMap[Number(agId)] || act.email || String(agId)
      return [userLabel, String(d.prospectos_altas||0), String(d.prospectos_cambios_estado||0), String(d.prospectos_notas||0), String(d.planificacion_ediciones||0), String(d.clientes_altas||0), String(d.clientes_modificaciones||0), String(d.polizas_altas||0), String(d.polizas_modificaciones||0)]
    })
    y = ensure(y, 24)
    // @ts-expect-error autotable
    doc.autoTable({ startY: y, head: [head2], body: rows2, styles: { fontSize: 7, cellPadding: 1 }, headStyles: { fillColor: [235,239,241], textColor: [7,46,64], fontSize: 8 }, theme: 'grid', margin: { top: headerHeight + 6, left: 14, right: 14 }, columnStyles: { 0:{halign:'left'}, 1:{halign:'center'}, 2:{halign:'center'}, 3:{halign:'center'}, 4:{halign:'center'}, 5:{halign:'center'}, 6:{halign:'center'}, 7:{halign:'center'}, 8:{halign:'center'} }, didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) } })
    const withAutoB = doc as unknown as { lastAutoTable?: { finalY?: number } }
    y = (withAutoB.lastAutoTable?.finalY || y) + GAP
  }
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