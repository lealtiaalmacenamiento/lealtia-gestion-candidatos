import type { Prospecto } from '@/types'

async function loadJSPDF() { return (await import('jspdf')).jsPDF }
async function loadAutoTable() { return (await import('jspdf-autotable')).default }

function pct(part:number,total:number){ if(!total) return '0%'; return ((part/total)*100).toFixed(1)+'%' }
const MX_TZ='America/Mexico_City'
function formatFechaCita(iso?:string|null){
  if(!iso) return ''
  try {
    // Asegurar que se interprete como UTC (Date ya lo hace si termina en Z) y luego formatear en CDMX sin segundos
    const d=new Date(iso)
    const fecha = new Intl.DateTimeFormat('es-MX',{timeZone:MX_TZ, day:'2-digit', month:'2-digit'}).format(d)
    const hora = new Intl.DateTimeFormat('es-MX',{timeZone:MX_TZ, hour:'2-digit', minute:'2-digit', hour12:false}).format(d)
    return `${fecha} ${hora}`
  } catch { return iso||'' }
}
function nowMX(){
  const d=new Date()
  const fecha = new Intl.DateTimeFormat('es-MX',{timeZone:MX_TZ, day:'2-digit', month:'2-digit', year:'numeric'}).format(d)
  const hora = new Intl.DateTimeFormat('es-MX',{timeZone:MX_TZ, hour:'2-digit', minute:'2-digit', hour12:false}).format(d)
  return `${fecha} ${hora}`
}
async function fetchLogoDataUrl(): Promise<string|undefined>{
  try {
  const url = (typeof process !== 'undefined' ? (process.env?.NEXT_PUBLIC_MAIL_LOGO_URL || process.env?.MAIL_LOGO_URL) : undefined)
    if(!url) return
    const resp = await fetch(url)
    if(!resp.ok) return
    const blob = await resp.blob()
    const b64 = await new Promise<string>((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(String(fr.result)); fr.onerror=reject; fr.readAsDataURL(blob) })
    return b64
  } catch { return }
}

interface ResumenAgente { agente?: string; total:number; por_estado: Record<string,number> }
type ExtendedProspecto = Prospecto & { agente_id?: number }

export async function exportProspectosPDF(
  prospectos: Prospecto[],
  resumen: { total:number; por_estado: Record<string,number>; cumplimiento_30:boolean },
  titulo: string,
  opts?: { incluirId?: boolean; agrupadoPorAgente?: boolean; agentesMap?: Record<number,string>; chartEstados?: boolean; chartEstadosPie?: boolean }
){
  if(!prospectos.length) return
  const jsPDF = await loadJSPDF(); await loadAutoTable()
  const doc = new jsPDF()
  const logo = await fetchLogoDataUrl()
  // Header bar
  doc.setFillColor(7,46,64)
  doc.rect(0,0,210,22,'F')
  if(logo){ try { doc.addImage(logo,'PNG',10,4,34,14) } catch {/*ignorar*/} }
  doc.setTextColor(255,255,255)
  doc.setFont('helvetica','bold')
  doc.setFontSize(13)
  doc.text(titulo, logo? 50:12, 11)
  doc.setFontSize(8)
  doc.setFont('helvetica','normal')
  doc.text('Generado (CDMX): '+ nowMX(), logo? 50:12, 17)
  doc.setTextColor(0,0,0)
  doc.setFontSize(9)
  const incluirId = opts?.incluirId
  const agrupado = opts?.agrupadoPorAgente
  const agentesMap = opts?.agentesMap || {}
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
      // Pie alongside
      if(opts.chartEstadosPie){
        try {
          const canvas = document.createElement('canvas'); const size=80; canvas.width=size; canvas.height=size
          const ctx = canvas.getContext('2d');
          if(ctx){ const totalVal=dataEntries.reduce((s,d)=>s+d[1],0)||1; let start=-Math.PI/2; dataEntries.forEach(d=>{ const portion=d[1]/totalVal; const end=start+portion*Math.PI*2; ctx.beginPath(); ctx.moveTo(size/2,size/2); ctx.arc(size/2,size/2,size/2,start,end); ctx.closePath(); ctx.fillStyle=d[2]; ctx.fill(); start=end })
            // Legend right side
            ctx.font='7px Arial'; dataEntries.forEach((d,i)=>{ ctx.fillStyle=d[2]; ctx.fillRect(size+4,4+i*14,10,10); ctx.fillStyle='#000'; const percent=((d[1]/totalVal)*100).toFixed(1)+'%'; ctx.fillText(`${d[0]} ${percent}`, size+18,12+i*14) })
            const exportCanvas=document.createElement('canvas'); exportCanvas.width=size+110; exportCanvas.height=size; const ex=exportCanvas.getContext('2d'); if(ex){ ex.fillStyle='#fff'; ex.fillRect(0,0,exportCanvas.width,exportCanvas.height); ex.drawImage(canvas,0,0); const dataUrl=exportCanvas.toDataURL('image/png'); doc.addImage(dataUrl,'PNG',baseX+95, chartY, 60, 50) }
          }
        } catch {}
      }
      y = baseY + 10
      if(opts.chartEstadosPie){
        // Pie chart (canvas -> image)
        try {
          const canvas = document.createElement('canvas')
          const size = 120; canvas.width = size; canvas.height = size
          const ctx = canvas.getContext('2d')
          if(ctx){
            const totalVal = dataEntries.reduce((s,d)=> s+d[1],0) || 1
            let start = -Math.PI/2
            dataEntries.forEach(d=>{
              const portion = d[1]/totalVal
              const end = start + portion * Math.PI *2
              ctx.beginPath()
              ctx.moveTo(size/2,size/2)
              ctx.arc(size/2,size/2,size/2,start,end)
              ctx.closePath()
              ctx.fillStyle = d[2]
              ctx.fill()
              start = end
            })
            // Legend
            const legendX = size + 10
            ctx.font = '10px Arial'
            dataEntries.forEach((d,i)=>{
              ctx.fillStyle = d[2]
              ctx.fillRect(legendX, 8 + i*16, 12, 12)
              ctx.fillStyle = '#000'
              const percent = ((d[1]/totalVal)*100).toFixed(1)+'%'
              ctx.fillText(`${d[0]} (${percent})`, legendX + 16, 18 + i*16)
            })
            const exportCanvas = document.createElement('canvas')
            exportCanvas.width = size + 140
            exportCanvas.height = size
            const exCtx = exportCanvas.getContext('2d')
            if(exCtx){
              exCtx.fillStyle = '#fff'
              exCtx.fillRect(0,0,exportCanvas.width, exportCanvas.height)
              exCtx.drawImage(canvas,0,0)
              exCtx.drawImage(canvas,0,0)
              exCtx.drawImage(canvas,0,0)
              // Redraw legend elements (simpler to just copy from original by drawing legend separately not triple draw; correct approach: replicate above)
              // Actually replicate legend properly
              dataEntries.forEach((d,i)=>{
                exCtx.fillStyle = d[2]
                exCtx.fillRect(size + 10, 8 + i*16, 12, 12)
                exCtx.fillStyle = '#000'
                const percent = ((d[1]/totalVal)*100).toFixed(1)+'%'
                exCtx.fillText(`${d[0]} (${percent})`, size + 28, 18 + i*16)
              })
              const dataUrl = exportCanvas.toDataURL('image/png')
              doc.addImage(dataUrl,'PNG',14,y,80,80)
            }
          }
          y += 86
        } catch {/* ignore pie errors */}
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
      y = baseY + 10
      if(opts.chartEstadosPie){
        try {
          const canvas = document.createElement('canvas')
          const size=120; canvas.width=size; canvas.height=size
          const ctx=canvas.getContext('2d')
          if(ctx){
            const totalVal = dataEntries.reduce((s,d)=> s+d[1],0)||1
            let start=-Math.PI/2
            dataEntries.forEach(d=>{ const portion=d[1]/totalVal; const end=start+portion*Math.PI*2; ctx.beginPath(); ctx.moveTo(size/2,size/2); ctx.arc(size/2,size/2,size/2,start,end); ctx.closePath(); ctx.fillStyle=d[2]; ctx.fill(); start=end })
            const exportCanvas=document.createElement('canvas')
            exportCanvas.width=size+140; exportCanvas.height=size
            const ex=exportCanvas.getContext('2d')
            if(ex){ ex.fillStyle='#fff'; ex.fillRect(0,0,exportCanvas.width,exportCanvas.height); ex.drawImage(canvas,0,0); dataEntries.forEach((d,i)=>{ ex.fillStyle=d[2]; ex.fillRect(size+10,8+i*16,12,12); ex.fillStyle='#000'; const percent=((d[1]/(totalVal))*100).toFixed(1)+'%'; ex.fillText(`${d[0]} (${percent})`, size+28,18+i*16) }); const dataUrl=exportCanvas.toDataURL('image/png'); doc.addImage(dataUrl,'PNG',14,y,80,80); y+=86 }
          }
        } catch {}
      }
    }
  }
  // Footer with pagination
  const pageCount: number = (doc as unknown as { internal:{ getNumberOfPages:()=>number } }).internal.getNumberOfPages()
  for(let i=1;i<=pageCount;i++){
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120); doc.text(`Página ${i}/${pageCount}`, 200, 292, {align:'right'}); doc.text('Lealtia',14,292)
  }
  doc.save('prospectos.pdf')
}