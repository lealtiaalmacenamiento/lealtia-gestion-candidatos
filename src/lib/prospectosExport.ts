import type { Prospecto } from '@/types'
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
  // Intenta URL de entorno; fallback a /file.svg si existe.
  const candidates: (string|undefined)[] = []
  if(typeof process !== 'undefined') candidates.push(process.env?.NEXT_PUBLIC_MAIL_LOGO_URL, process.env?.MAIL_LOGO_URL)
  candidates.push('/file.svg','/logo.png','/logo.svg')
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
    incluirFunnel?: boolean
  }
){
  if(!prospectos.length) return
  const jsPDF = await loadJSPDF(); await loadAutoTable()
  const doc = new jsPDF()
  const logo = await fetchLogoDataUrl()
  const generadoEn = nowMX()
  const drawHeader = ()=>{
    doc.setFillColor(7,46,64)
    doc.rect(0,0,210,22,'F')
    if(logo){ try { doc.addImage(logo,'PNG',10,4,34,14) } catch {/*ignore*/} }
    doc.setTextColor(255,255,255)
    doc.setFont('helvetica','bold'); doc.setFontSize(13)
    doc.text(titulo, logo? 50:12, 11)
    doc.setFontSize(8); doc.setFont('helvetica','normal')
    doc.text('Generado (CDMX): '+ generadoEn, logo? 50:12, 17)
    doc.setTextColor(0,0,0)
  }
  drawHeader()
  doc.setFontSize(9)
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
  const incluirFunnel = opts?.incluirFunnel !== false // por defecto sí
  const head = [ ...(incluirId? ['ID']: []), 'Nombre','Teléfono','Estado','Fecha Cita','Notas', ...(agrupado? ['Agente']: []) ]
  const body = prospectos.map(p=> { const ep = p as ExtendedProspecto; return [ ...(incluirId? [p.id]: []), p.nombre, p.telefono||'', p.estado, formatFechaCita(p.fecha_cita), (p.notas||'').slice(0,80), ...(agrupado? [agentesMap[ep.agente_id ?? -1] || '']: []) ] })
  // @ts-expect-error autotable plugin
  doc.autoTable({ startY: 24, head: [head], body, styles:{ fontSize:7, cellPadding:1.5 }, headStyles:{ fillColor:[7,46,64], fontSize:8 }, alternateRowStyles:{ fillColor:[245,247,248] }, theme:'grid' })
    interface DocMaybeAuto { lastAutoTable?: { finalY?: number } }
    const docWith = doc as unknown as DocMaybeAuto
    let y = docWith.lastAutoTable?.finalY || 24
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica','bold'); doc.text('Resumen',14,y); doc.setFont('helvetica','normal')
  y += 4
  if(!agrupado){
    // Summary cards (2 columns)
    const cards: Array<[string,string]> = [
      ['Total', String(resumen.total)],
      ['Pendiente', `${resumen.por_estado.pendiente||0} (${pct(resumen.por_estado.pendiente||0,resumen.total)})`],
      ['Seguimiento', `${resumen.por_estado.seguimiento||0} (${pct(resumen.por_estado.seguimiento||0,resumen.total)})`],
      ['Con cita', `${resumen.por_estado.con_cita||0} (${pct(resumen.por_estado.con_cita||0,resumen.total)})`],
      ['Descartado', `${resumen.por_estado.descartado||0} (${pct(resumen.por_estado.descartado||0,resumen.total)})`],
      ['Cumplimiento 30', resumen.cumplimiento_30? 'SI':'NO']
    ]
    const cardW = 60; const cardH=12; let cx=14; let cy=y
    doc.setFontSize(8)
    cards.forEach((c,i)=>{ doc.setDrawColor(220); doc.setFillColor(248,250,252); doc.roundedRect(cx,cy,cardW,cardH,2,2,'FD'); doc.setFont('helvetica','bold'); doc.text(c[0], cx+3, cy+5); doc.setFont('helvetica','normal'); doc.text(c[1], cx+3, cy+10);
      if((i+1)%3===0){ cx=14; cy+=cardH+4 } else { cx+=cardW+6 } })
    y = cy + cardH + 8
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
  const barW = 18
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
      y = baseY + 10
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
      y += 26
      // Funnel
      if(incluirFunnel){
        const fY = y
        const pendiente = resumen.por_estado.pendiente||0
        const seguimiento = resumen.por_estado.seguimiento||0
        const conCita = resumen.por_estado.con_cita||0
        const anchoBase = 90
        const baseXf = 14
        const totalF = pendiente + seguimiento + conCita || 1
        const escala = (v:number)=> (v/totalF)*anchoBase
        const pasos: Array<[string, number, string]> = [
          ['Pendiente', pendiente, '#0d6efd'],
          ['Seguimiento', seguimiento, '#6f42c1'],
          ['Con cita', conCita, '#198754']
        ]
        doc.setFontSize(8); doc.text('Funnel', baseXf, fY)
        let curY = fY + 2
        pasos.forEach((p,i)=>{
          const [label, val, color] = p
          const w = Math.max(10, escala(val))
          const hex = color.substring(1)
          const r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16)
          doc.setFillColor(r,g,b)
          doc.rect(baseXf, curY, w, 8, 'F')
          doc.setTextColor(255,255,255)
          doc.setFontSize(7)
          doc.text(`${label} ${val} (${pct(val,totalF)})`, baseXf+2, curY+5)
          doc.setTextColor(0,0,0)
          curY += 10
          if(i < pasos.length-1){ doc.setFontSize(8); doc.text('↓', baseXf+ w/2, curY-2) }
        })
        y = curY + 2
      }
    }
  } else {
    const porAgente: Record<string,ResumenAgente> = {}
    for(const p of prospectos){
      const ep = p as ExtendedProspecto
      const agName = agentesMap[ep.agente_id ?? -1] || `Ag ${ ep.agente_id}`
      if(!porAgente[agName]) porAgente[agName] = { agente: agName, total:0, por_estado:{ pendiente:0, seguimiento:0, con_cita:0, descartado:0 } }
      const bucket = porAgente[agName]
      bucket.total++
      if(bucket.por_estado[p.estado] !== undefined) bucket.por_estado[p.estado]++
    }
    const head2 = ['Agente','Total','Pendiente','Seguimiento','Con cita','Descartado']
    const body2 = Object.values(porAgente).map(r=> [r.agente, r.total, r.por_estado.pendiente, r.por_estado.seguimiento, r.por_estado.con_cita, r.por_estado.descartado])
  // @ts-expect-error autotable plugin
  doc.autoTable({ startY:y, head:[head2], body:body2, styles:{fontSize:7, cellPadding:1.5}, headStyles:{ fillColor:[7,46,64], fontSize:8 }, alternateRowStyles:{ fillColor:[245,247,248] }, theme:'grid' })
    // Global charts if requested (agrupado scenario)
    if(opts?.chartEstados){
      const docWith2 = doc as unknown as { lastAutoTable?: { finalY?: number } }
      y = (docWith2.lastAutoTable?.finalY || y) + 8
      doc.setFontSize(10); doc.text('Resumen Global',14,y); y+=4
      const lines = [
        `Total: ${resumen.total}`,
        `Pendiente: ${resumen.por_estado.pendiente||0} (${pct(resumen.por_estado.pendiente||0,resumen.total)})`,
        `Seguimiento: ${resumen.por_estado.seguimiento||0} (${pct(resumen.por_estado.seguimiento||0,resumen.total)})`,
        `Con cita: ${resumen.por_estado.con_cita||0} (${pct(resumen.por_estado.con_cita||0,resumen.total)})`,
        `Descartado: ${resumen.por_estado.descartado||0} (${pct(resumen.por_estado.descartado||0,resumen.total)})`
      ]
      lines.forEach(l=> { doc.text(l,14,y); y+=4 })
      const dataEntries: Array<[string, number, string]> = [
        ['pendiente', resumen.por_estado.pendiente||0, '#0d6efd'],
        ['seguimiento', resumen.por_estado.seguimiento||0, '#6f42c1'],
        ['con_cita', resumen.por_estado.con_cita||0, '#198754'],
        ['descartado', resumen.por_estado.descartado||0, '#dc3545']
      ]
      const maxV = Math.max(1,...dataEntries.map(d=>d[1]))
      const chartY = y + 2
      const baseX = 14
      const barW = 18
      const gap = 6
      const baseY = chartY + 40
      doc.setFontSize(8)
      dataEntries.forEach((d,i)=>{
        const [key,val,color]=d
        const h = (val/maxV)*30
        const x = baseX + i*(barW+gap)
        const yBar = baseY - h
        const hex = color.startsWith('#')? color.substring(1): color
        const r = parseInt(hex.substring(0,2),16)
        const g = parseInt(hex.substring(2,4),16)
        const b = parseInt(hex.substring(4,6),16)
        doc.setFillColor(r,g,b)
        doc.rect(x,yBar,barW,h,'F')
        doc.text(String(val), x+barW/2, yBar-2, {align:'center'})
        doc.text(key.replace('_',' '), x+barW/2, baseY+4, {align:'center'})
      })
      y = baseY + 14
      // Progresos globales
      const drawProgress = (label:string, val:number, meta:number, pxY:number)=>{
        const pctVal = meta? Math.min(1, val/meta): 0
        const barWTotal = 80; const barH = 6
        doc.setFontSize(7); doc.text(`${label}: ${val}/${meta}`, baseX, pxY-1)
        doc.setDrawColor(200); doc.rect(baseX, pxY, barWTotal, barH)
        doc.setFillColor(7,46,64); doc.rect(baseX, pxY, barWTotal*pctVal, barH, 'F')
        doc.setTextColor(255,255,255); doc.text(Math.round(pctVal*100)+'%', baseX+barWTotal/2, pxY+barH-1, {align:'center'}); doc.setTextColor(0,0,0)
      }
  drawProgress('Meta prospectos', resumen.total, metaProspectos, y)
      y += 10
  drawProgress('Meta citas', resumen.por_estado.con_cita||0, metaCitas, y)
      y += 14
      if(incluirFunnel){
        const pendiente = resumen.por_estado.pendiente||0
        const seguimiento = resumen.por_estado.seguimiento||0
        const conCita = resumen.por_estado.con_cita||0
        const totalF = pendiente + seguimiento + conCita || 1
        const pasos: Array<[string, number, string]> = [
          ['Pendiente', pendiente, '#0d6efd'],
          ['Seguimiento', seguimiento, '#6f42c1'],
          ['Con cita', conCita, '#198754']
        ]
        doc.setFontSize(8); doc.text('Funnel', baseX, y)
        let curY = y + 2
        const escala = (v:number)=> (v/totalF)*90
        pasos.forEach((p,i)=>{
          const [label,val,color]=p
          const w = Math.max(10, escala(val))
            const hex=color.substring(1)
            const r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16)
            doc.setFillColor(r,g,b)
            doc.rect(baseX, curY, w, 8, 'F')
            doc.setTextColor(255,255,255); doc.setFontSize(7); doc.text(`${label} ${val} (${pct(val,totalF)})`, baseX+2, curY+5)
            doc.setTextColor(0,0,0)
            curY += 10
            if(i<pasos.length-1) doc.text('↓', baseX + w/2, curY-2)
        })
        y = curY + 2
      }
    }
  }
  // Footer with pagination
  const pageCount: number = (doc as unknown as { internal:{ getNumberOfPages:()=>number } }).internal.getNumberOfPages()
  for(let i=1;i<=pageCount;i++){
    doc.setPage(i)
    // Redibujar header (para páginas >1 ya estaba el contenido, sobreponemos barra)
    const ySnapshot = 0
    doc.setFillColor(255,255,255); doc.rect(0,ySnapshot,210,22,'F') // limpiar área
    // reutilizamos mismo header
  // Redibujamos manualmente header (drawHeader en closure)
    doc.setFillColor(7,46,64); doc.rect(0,0,210,22,'F')
    if(logo){ try { doc.addImage(logo,'PNG',10,4,34,14) } catch {/* ignore */} }
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.text(titulo, logo?50:12,11)
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.text('Generado (CDMX): '+ generadoEn, logo?50:12,17); doc.setTextColor(0,0,0)
    // Footer
    doc.setFontSize(7); doc.setTextColor(120); doc.text(`Página ${i}/${pageCount}`, 200, 292, {align:'right'}); doc.text('Lealtia',14,292)
  }
  doc.save('prospectos.pdf')
}