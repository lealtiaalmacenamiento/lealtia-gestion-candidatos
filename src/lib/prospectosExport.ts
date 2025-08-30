import type { Prospecto } from '@/types'
import type { ExtendedMetrics, PreviousWeekDelta } from './prospectosMetrics'
import { formatFechaHoraCDMX } from '@/lib/datetime'

async function loadJSPDF() { return (await import('jspdf')).jsPDF }
async function loadAutoTable() { return (await import('jspdf-autotable')).default }

function pct(part:number,total:number){ if(!total) return '0%'; return ((part/total)*100).toFixed(1)+'%' }
const MX_TZ='America/Mexico_City'
// Reemplazamos por util central con fallback manual
function formatFechaCita(iso?:string|null){ return formatFechaHoraCDMX(iso) }
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

interface ResumenAgente { agente?: string; total:number; por_estado: Record<string,number> }
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
    metaCitas?: number
  forceLogoBlanco?: boolean
  extendedMetrics?: ExtendedMetrics
  prevWeekDelta?: PreviousWeekDelta
  perAgentExtended?: Record<number,ExtendedMetrics>
  filename?: string
  perAgentDeltas?: Record<number,{ totalDelta:number; citasDelta:number }>
  planningSummaries?: Record<number,{ prospeccion:number; citas:number; smnyl:number; total:number }>
  singleAgentPlanning?: { bloques: Array<{day:number; hour:string; activity:string; origin?:string; prospecto_nombre?:string; notas?:string}>; summary:{ prospeccion:number; citas:number; smnyl:number; total:number } }
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
  const incluirId = opts?.incluirId
  const agrupado = opts?.agrupadoPorAgente
  const agentesMap = opts?.agentesMap || {}
  let metaProspectos = opts?.metaProspectos ?? 30
  let metaCitas = opts?.metaCitas ?? 5
  const distinctAgentsCount = agrupado ? new Set(prospectos.map(p=> (p as ExtendedProspecto).agente_id)).size || 1 : 1
  if(agrupado){
    metaProspectos = metaProspectos * distinctAgentsCount
    metaCitas = metaCitas * distinctAgentsCount
  }
  let y = contentStartY
  if(!agrupado){
  const head = [ ...(incluirId? ['ID']: []), 'Nombre','Teléfono','Estado','Fecha Cita','Notas' ]
    const body = prospectos.map(p=> [ ...(incluirId? [p.id]: []), p.nombre, p.telefono||'', p.estado, formatFechaCita(p.fecha_cita), (p.notas||'').slice(0,120) ])
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
        if(incluirId){
          // Total 182mm: 12 + 40 + 26 + 22 + 28 + 54 = 182
          s[base+0] = { cellWidth: 40, halign:'left' } // Nombre
          s[base+1] = { cellWidth: 26, halign:'center' } // Teléfono
          s[base+2] = { cellWidth: 22, halign:'center' } // Estado
          s[base+3] = { cellWidth: 28, halign:'center' } // Fecha Cita
          s[base+4] = { cellWidth: 54, overflow:'linebreak', halign:'left' } // Notas
        } else {
          // Total 182mm: 42 + 26 + 22 + 28 + 64 = 182
          s[base+0] = { cellWidth: 42, halign:'left' } // Nombre
          s[base+1] = { cellWidth: 26, halign:'center' } // Teléfono
          s[base+2] = { cellWidth: 22, halign:'center' } // Estado
          s[base+3] = { cellWidth: 28, halign:'center' } // Fecha Cita
          s[base+4] = { cellWidth: 64, overflow:'linebreak', halign:'left' } // Notas
        }
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
  doc.setFont('helvetica','bold'); doc.text(agrupado? 'Resumen por agente':'Resumen',14,y); doc.setFont('helvetica','normal')
  y += 4
  if(!agrupado){
    // Summary cards (2 columns)
    const cards: Array<[string,string]> = [
  ['Prospectos totales', String(resumen.total)],
      ['Pendiente', `${resumen.por_estado.pendiente||0} (${pct(resumen.por_estado.pendiente||0,resumen.total)})`],
      ['Seguimiento', `${resumen.por_estado.seguimiento||0} (${pct(resumen.por_estado.seguimiento||0,resumen.total)})`],
  ['Con cita agendada', `${resumen.por_estado.con_cita||0} (${pct(resumen.por_estado.con_cita||0,resumen.total)})`],
      ['Descartado', `${resumen.por_estado.descartado||0} (${pct(resumen.por_estado.descartado||0,resumen.total)})`],
      ['Cumplimiento 30', resumen.cumplimiento_30? 'SI':'NO']
    ]
  // 3 tarjetas por fila dentro de 182mm útiles: 3*56 + 2*6 = 180 <= 182
  const cardW = 56; const cardH=12; let cx=14; let cy=y
    doc.setFontSize(8)
    cards.forEach((c,i)=>{ doc.setDrawColor(220); doc.setFillColor(248,250,252); doc.roundedRect(cx,cy,cardW,cardH,2,2,'FD'); doc.setFont('helvetica','bold'); doc.text(c[0], cx+3, cy+5); doc.setFont('helvetica','normal'); doc.text(c[1], cx+3, cy+10);
      if((i+1)%3===0){ cx=14; cy+=cardH+4 } else { cx+=cardW+6 } })
  y = cy + cardH + GAP
  if(opts?.chartEstados){
      // Simple bar chart for estados
      const chartY = y + 4
      const dataEntries: Array<[string, number, string]> = [
        ['pendiente', resumen.por_estado.pendiente||0, '#0d6efd'],
        ['seguimiento', resumen.por_estado.seguimiento||0, '#6f42c1'],
        ['con_cita', resumen.por_estado.con_cita||0, '#198754'],
        ['descartado', resumen.por_estado.descartado||0, '#dc3545']
      ]
      const maxV = Math.max(1,...dataEntries.map(d=>d[1]))
  const baseX = 14
  const barW = 16
  const gap = 6
  const baseY = chartY + 40
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
        doc.text(String(val), x+barW/2, yBar-2, {align:'center'})
        doc.text(key.replace('_',' '), x+barW/2, baseY+4, {align:'center'})
      })
  y = baseY + GAP
      // Añadir progreso contra metas debajo del chart
      // Progreso Prospectos
      const progY = y
      const drawProgress = (label:string, val:number, meta:number, pxY:number)=>{
        const pctVal = meta? Math.min(1, val/meta): 0
        const barWTotal = 80; const barH = 6
        doc.setFontSize(7); doc.text(`${label}: ${val}/${meta}`, baseX, pxY-1)
        doc.setDrawColor(200); doc.rect(baseX, pxY, barWTotal, barH)
        doc.setFillColor(7,46,64); doc.rect(baseX, pxY, barWTotal*pctVal, barH, 'F')
        doc.setTextColor(255,255,255); doc.text(Math.round(pctVal*100)+'%', baseX+barWTotal/2, pxY+barH-1, {align:'center'}); doc.setTextColor(0,0,0)
      }
  drawProgress('Meta prospectos', resumen.total, metaProspectos, progY+2)
  drawProgress('Meta citas', resumen.por_estado.con_cita||0, metaCitas, progY+12)
  // Más espacio tras barras de progreso para separar del siguiente bloque
  y += 28
    }
    // Métricas avanzadas (agente individual) debajo del bloque anterior para evitar sobreposición
    if(opts?.extendedMetrics){
      const em = opts.extendedMetrics
      // Línea separadora sutil y extra espacio antes del título
      doc.setDrawColor(230); doc.line(14, y, 196, y); y += 4
      doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.text('Métricas avanzadas',14,y)
      y += 4; doc.setFontSize(7); doc.setFont('helvetica','normal')
      // Distribución horas (compacta) (se deja aparte de la tabla)
      const horas = Object.entries(em.citasPorHora).sort((a,b)=> a[0].localeCompare(b[0]))
      if(horas.length){
        y+=2; doc.setFont('helvetica','bold'); doc.text('Citas por hora:',14,y); doc.setFont('helvetica','normal'); y+=4
        const chunk: string[] = []
        horas.forEach(([h,c],i)=>{ chunk.push(`${h}:00=${c}`); if(chunk.length===6 || i===horas.length-1){ doc.text(chunk.join('  '),14,y); y+=4; chunk.length=0 } })
      }
      if(em.riesgoSeguimientoSinCita.length){
        y+=2; doc.setFont('helvetica','bold'); doc.text('En riesgo (seguimiento sin cita):',14,y); y+=4; doc.setFont('helvetica','normal')
        em.riesgoSeguimientoSinCita.forEach(rg=> { doc.text(`${rg.nombre} (${rg.dias}d)`,14,y); y+=4 })
      }
      // Tabla compacta de métricas clave
      const includeDelta = !!opts?.prevWeekDelta
  const header = ['Conv P->S','Conv S->C','Desc %','Prom días 1ra cita','Proy semana', ...(includeDelta? ['Prospectos vs semana anterior','Citas vs semana anterior']: []) ]
      const row = [
        (em.conversionPendienteSeguimiento*100).toFixed(1)+'%',
        (em.conversionSeguimientoCita*100).toFixed(1)+'%',
        (em.ratioDescartado*100).toFixed(1)+'%',
        em.promedioDiasPrimeraCita!=null? em.promedioDiasPrimeraCita.toFixed(1):'-',
        em.forecastSemanaTotal!=null? String(em.forecastSemanaTotal):'-',
        ...(includeDelta? [
          (opts.prevWeekDelta!.totalDelta>=0? '+':'')+String(opts.prevWeekDelta!.totalDelta),
          (opts.prevWeekDelta!.conCitaDelta>=0? '+':'')+String(opts.prevWeekDelta!.conCitaDelta)
        ]: [])
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
  columnStyles: { 0:{ halign:'center' }, 1:{ halign:'center' }, 2:{ halign:'center' }, 3:{ halign:'center' }, 4:{ halign:'center' }, 5:{ halign:'center' }, 6:{ halign:'center' }, 7:{ halign:'center' } },
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
    const head2 = ['Agente','Total','Pendiente','Seguimiento','Con cita','Descartado', ...(includeAgentDeltaResumen? ['Prospectos vs semana anterior','Citas vs semana anterior']: [])]
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
        ...(includeAgentDeltaResumen? [ deltas? (deltas.totalDelta>=0? '+'+deltas.totalDelta: String(deltas.totalDelta)):'-', deltas? (deltas.citasDelta>=0? '+'+deltas.citasDelta: String(deltas.citasDelta)):'-' ]: [])
      ]
    })
    // Totales al final
    const totals = Object.values(porAgente).reduce((acc, r)=>{
      acc.total += r.total
      acc.pendiente += r.por_estado.pendiente
      acc.seguimiento += r.por_estado.seguimiento
      acc.con_cita += r.por_estado.con_cita
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
      ...(includeAgentDeltaResumen? ['','']: [])
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
      const chartTop = y
      const baseX = 14
  const barW = 16
  const barGap = 6
      const chartHeight = 42 // altura destino (30 barras + labels + margen)
      const dataEntries: Array<[string, number, string]> = [
        ['pendiente', resumen.por_estado.pendiente||0, '#0d6efd'],
        ['seguimiento', resumen.por_estado.seguimiento||0, '#6f42c1'],
        ['con_cita', resumen.por_estado.con_cita||0, '#198754'],
        ['descartado', resumen.por_estado.descartado||0, '#dc3545']
      ]
      const maxV = Math.max(1,...dataEntries.map(d=>d[1]))
      doc.setFontSize(8)
      dataEntries.forEach((d,i)=>{
        const [key,val,color] = d
        const h = (val/maxV)*30
        const x = baseX + i*(barW+barGap)
        const yBar = chartTop + 30 - h
        const hex = color.replace('#','')
        const r=parseInt(hex.substring(0,2),16), g=parseInt(hex.substring(2,4),16), b=parseInt(hex.substring(4,6),16)
        doc.setFillColor(r,g,b)
        doc.rect(x,yBar,barW,h,'F')
        doc.text(String(val), x+barW/2, yBar-2, {align:'center'})
        doc.text(key.replace('_',' '), x+barW/2, chartTop+32, {align:'center'})
      })
      // Progresos bajo chart
      const progressTop = chartTop + chartHeight
      const drawProgress = (label:string, val:number, meta:number, lineY:number)=>{
        const pctVal = meta? Math.min(1,val/meta):0
        const totalW=80, h=6
        doc.setFontSize(7); doc.text(`${label}: ${val}/${meta}`, baseX, lineY-1)
        doc.setDrawColor(200); doc.rect(baseX, lineY, totalW, h)
        doc.setFillColor(7,46,64); doc.rect(baseX, lineY, totalW*pctVal, h, 'F')
        doc.setTextColor(255,255,255); doc.text(Math.round(pctVal*100)+'%', baseX+totalW/2, lineY+h-1, {align:'center'}); doc.setTextColor(0,0,0)
      }
      drawProgress('Meta prospectos', resumen.total, metaProspectos, progressTop+2)
      drawProgress('Meta citas', resumen.por_estado.con_cita||0, metaCitas, progressTop+12)
      const chartBlockBottom = progressTop + 20
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
  // Añadir más espacio antes del siguiente bloque para que 'Métricas avanzadas' no quede pegado
  y = Math.max(chartBlockBottom, cardY) + GAP + 12
    }
  // Métricas por agente agrupado
      if(opts?.perAgentExtended){
        doc.setFontSize(10); doc.text('Métricas avanzadas por agente',14,y); y+=4
        doc.setFontSize(7)
        const includeAgentDelta = !!opts?.perAgentDeltas
  const header = ['Agente','Conv P->S','Conv S->C','Desc %','Prom días 1ra cita','Proy semana', ...(includeAgentDelta? ['Prospectos vs semana anterior','Citas vs semana anterior']: [])]
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
              (em.conversionSeguimientoCita*100).toFixed(1)+'%',
              (em.ratioDescartado*100).toFixed(1)+'%',
              em.promedioDiasPrimeraCita!=null? em.promedioDiasPrimeraCita.toFixed(1):'-',
              em.forecastSemanaTotal!=null? String(em.forecastSemanaTotal):'-',
              ...(includeAgentDelta? [
                deltas? (deltas.totalDelta>=0? '+':'')+deltas.totalDelta : '-',
                deltas? (deltas.citasDelta>=0? '+':'')+deltas.citasDelta : '-'
              ]: [])
            ]
          }),
          styles:{fontSize:7, cellPadding:1.5}, headStyles:{ fillColor:[7,46,64], fontSize:8 }, theme:'grid',
          margin: { top: headerHeight + 6, left: 14, right: 14 },
          columnStyles: { 1:{ halign:'center' }, 2:{ halign:'center' }, 3:{ halign:'center' }, 4:{ halign:'center' }, 5:{ halign:'center' }, 6:{ halign:'center' }, 7:{ halign:'center' } },
          didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
        })
        const withAuto = doc as unknown as { lastAutoTable?: { finalY?: number } }
  y = (withAuto.lastAutoTable?.finalY || y) + GAP
      }

      // Resumen de planificación semanal por agente (si se proporcionó)
      if(opts?.planningSummaries){
        const totalAgg = Object.values(opts.planningSummaries).reduce((acc,cur)=>{ acc.prospeccion+=cur.prospeccion; acc.citas+=cur.citas; acc.smnyl+=cur.smnyl; acc.total+=cur.total; return acc },{prospeccion:0,citas:0,smnyl:0,total:0})
        // Salto de página si poco espacio
        if(y > 200){
          doc.addPage()
          const hdr = drawHeader()
          y = hdr.contentStartY
        }
        doc.setFontSize(10); doc.text('Planificación semanal (resumen y detalle por agente)',14,y); y+=4
        // Tarjetas resumen total
        const cardsPlan: Array<[string,string]> = [
          ['Prospección', String(totalAgg.prospeccion)],
          ['Citas', String(totalAgg.citas)],
          ['SMNYL', String(totalAgg.smnyl)],
          ['Total bloques', String(totalAgg.total)]
        ]
  // 4 tarjetas en una fila: ajustar ancho para no exceder 210mm (14 + 4*W + 3*gap <= 210)
  // 4 tarjetas por fila: 4*42 + 3*6 = 186 -> bajamos a 41: 4*41 + 18 = 182
  const cardW=41, cardH=12; let cx=14; let cy=y
        doc.setFontSize(8)
        cardsPlan.forEach((c,i)=>{ doc.setDrawColor(220); doc.setFillColor(248,250,252); doc.roundedRect(cx,cy,cardW,cardH,2,2,'FD'); doc.setFont('helvetica','bold'); doc.text(c[0], cx+3, cy+5); doc.setFont('helvetica','normal'); doc.text(c[1], cx+3, cy+10); if((i+1)%4===0){ cx=14; cy+=cardH+4 } else { cx+=cardW+6 } })
  y = cy + cardH + GAP
        doc.setFontSize(7)
        const headPlan = ['Agente','Prospección','Citas','SMNYL','Total']
        // @ts-expect-error autotable
        doc.autoTable({
          startY:y,
          head:[headPlan],
          body: Object.entries(opts.planningSummaries).map(([agId,sum])=>[
            agentesMap[Number(agId)]||agId, String(sum.prospeccion), String(sum.citas), String(sum.smnyl), String(sum.total)
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
    if(y > 200){
      doc.addPage()
      const hdr2 = drawHeader()
      y = hdr2.contentStartY
    }
  let y2 = y + 4
    const plan = opts.singleAgentPlanning
    doc.setFontSize(10); doc.text('Planificación semanal',14,y2); y2 += 4
    const cardsPlan: Array<[string,string]> = [ ['Prospección', String(plan.summary.prospeccion)], ['Citas', String(plan.summary.citas)], ['SMNYL', String(plan.summary.smnyl)], ['Total bloques', String(plan.summary.total)] ]
  // 4 tarjetas por fila: usar 41mm para caber en 182mm con 3 gaps de 6mm
  const cardW=41, cardH=12; let cx=14; let cy=y2; doc.setFontSize(8)
    cardsPlan.forEach((c,i)=>{ doc.setDrawColor(220); doc.setFillColor(248,250,252); doc.roundedRect(cx,cy,cardW,cardH,2,2,'FD'); doc.setFont('helvetica','bold'); doc.text(c[0], cx+3, cy+5); doc.setFont('helvetica','normal'); doc.text(c[1], cx+3, cy+10); if((i+1)%4===0){ cx=14; cy+=cardH+4 } else { cx+=cardW+6 } })
  cy += cardH + GAP
    const DAY_NAMES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
    const blocksSorted = [...plan.bloques].sort((a,b)=> a.day===b.day? a.hour.localeCompare(b.hour): a.day-b.day)
    if(blocksSorted.length){
      const headPlan = ['Día','Hora','Actividad','Detalle']
      const bodyPlan = blocksSorted.map(b=> [
        DAY_NAMES[b.day]||String(b.day),
        b.hour+':00',
        b.activity==='PROSPECCION'? 'Prospección': (b.activity==='CITAS'? 'Citas': b.activity),
        (b.prospecto_nombre? b.prospecto_nombre: '') + (b.notas? (b.prospecto_nombre? ' - ':'')+ b.notas: '')
      ])
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
    }
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