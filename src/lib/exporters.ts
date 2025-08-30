import type { Candidato, Prospecto, BloquePlanificacion } from '@/types'
import { calcularDerivados, etiquetaProceso } from '@/lib/proceso'
import { obtenerSemanaIso } from '@/lib/semanaIso'

// Lazy dynamic imports para no inflar el bundle inicial
async function loadXLSX() { return (await import('xlsx')).default }
async function loadJSPDF() { return (await import('jspdf')).jsPDF }
async function loadAutoTable() { return (await import('jspdf-autotable')).default }

export async function exportCandidatosExcel(candidatos: Candidato[]) {
  if (!candidatos.length) return
  const XLSX = await loadXLSX()
  const data = candidatos.map(c => {
    const { proceso, dias_desde_ct } = calcularDerivados({
      periodo_para_registro_y_envio_de_documentos: c.periodo_para_registro_y_envio_de_documentos,
      capacitacion_cedula_a1: c.capacitacion_cedula_a1,
      periodo_para_ingresar_folio_oficina_virtual: c.periodo_para_ingresar_folio_oficina_virtual,
      periodo_para_playbook: c.periodo_para_playbook,
      pre_escuela_sesion_unica_de_arranque: c.pre_escuela_sesion_unica_de_arranque,
      fecha_limite_para_presentar_curricula_cdp: c.fecha_limite_para_presentar_curricula_cdp,
      inicio_escuela_fundamental: c.inicio_escuela_fundamental,
      fecha_tentativa_de_examen: c.fecha_tentativa_de_examen,
      fecha_creacion_ct: c.fecha_creacion_ct
    })
    return {
      ID: c.id_candidato,
      CT: c.ct,
      Candidato: c.candidato,
      'Cédula A1': c.mes,
      EFC: c.efc,
  Proceso: etiquetaProceso(proceso) || '',
      'Fecha creación CT': c.fecha_creacion_ct || '',
      'Días desde creación CT': dias_desde_ct ?? '',
      'Fecha tent. examen': c.fecha_tentativa_de_examen || ''
    }
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Candidatos')
  const fecha = new Date().toISOString().replace(/[:T]/g,'-').slice(0,16)
  XLSX.writeFile(wb, `candidatos_${fecha}.xlsx`)
}

export async function exportCandidatoPDF(c: Candidato) {
  const jsPDF = await loadJSPDF()
  await loadAutoTable()
  const doc = new jsPDF()

  // Helpers para header y branding uniforme
  const MX_TZ='America/Mexico_City'
  const nowMX = () => {
    const d=new Date()
    const fecha = new Intl.DateTimeFormat('es-MX',{timeZone:MX_TZ, day:'2-digit', month:'2-digit', year:'numeric'}).format(d)
    const hora = new Intl.DateTimeFormat('es-MX',{timeZone:MX_TZ, hour:'2-digit', minute:'2-digit', hour12:false}).format(d)
    return `${fecha} ${hora}`
  }
  const fetchLogoDataUrl = async (): Promise<string|undefined> => {
    const candidates: (string|undefined)[] = []
    if(typeof process !== 'undefined') candidates.push(process.env?.NEXT_PUBLIC_MAIL_LOGO_URL, process.env?.MAIL_LOGO_URL)
    candidates.push(
      '/Logolealtiaruedablanca.png','/Logolealtiaruedablanca.svg','/Logolealtiaruedablanca.webp',
      '/Logolealtia.png','/Logolealtia.svg','/Logolealtia.webp',
      '/favicon.png','/logo-blanco.png','/logo_white.png',
      '/file.svg','/logo.png','/logo.svg'
    )
    for(const url of candidates.filter(Boolean) as string[]){
      try { const resp = await fetch(url); if(!resp.ok) continue; const blob = await resp.blob();
        const b64 = await new Promise<string>((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(String(fr.result)); fr.onerror=reject; fr.readAsDataURL(blob) })
        return b64
      } catch { /* siguiente */ }
    }
    return
  }

  const titulo = `Ficha de Candidato #${c.id_candidato}`
  let logo = await fetchLogoDataUrl()
  let logoW = 0, logoH = 0
  if(logo){
    try {
      const img = new Image(); img.src = logo
      await new Promise(res=> { img.onload = res })
      const naturalW = img.width || 1
      const naturalH = img.height || 1
      const maxW = 42, maxH = 16
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
        const needWhite = avg < 120
        if(needWhite){
          for(let i=0;i<data.data.length;i+=4){ if(data.data[i+3] > 10){ data.data[i]=255; data.data[i+1]=255; data.data[i+2]=255 } }
          ctx.putImageData(data,0,0)
          logo = canvas.toDataURL('image/png')
        }
      }
    } catch { /* ignore */ }
  }
  const generadoEn = nowMX()
  const drawHeader = ()=>{
    const baseX = logo? 50:12
    const marginRight = 8
    const maxWidth = 210 - baseX - marginRight
    let headerHeight = 22
    // Calcular font size y líneas para el título
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
    const neededHeight = 6 + lines.length*lineHeight + 2 + dateFontSize + 6
    if(neededHeight > headerHeight) headerHeight = neededHeight
    // Fondo
    doc.setFillColor(7,46,64); doc.rect(0,0,210,headerHeight,'F')
    // Logo
    if(logo && logoW && logoH){ try { doc.addImage(logo,'PNG',10,(headerHeight-logoH)/2,logoW,logoH) } catch {/*ignore*/} } else { doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(255,255,255); doc.text('LOGO', 12, 14) }
    // Título
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(fontSize)
    lines.forEach((l,i)=>{ const baseline = 6 + (i+1)*lineHeight - (lineHeight - fontSize)/2; doc.text(l, baseX, baseline) })
    // Fecha
    const dateY = 6 + lines.length*lineHeight + 2 + dateFontSize
    doc.setFont('helvetica','normal'); doc.setFontSize(dateFontSize)
    doc.text('Generado (CDMX): '+ generadoEn, baseX, dateY)
    doc.setTextColor(0,0,0)
    return { headerHeight, contentStartY: headerHeight + 6 }
  }

  const { headerHeight, contentStartY } = drawHeader()
  doc.setFontSize(10)
  const rows: Array<[string,string]> = []
  const push = (k: string, v: unknown) => rows.push([k, v == null ? '' : String(v)])
  push('CT', c.ct)
  push('Candidato', c.candidato)
  push('Cédula A1', c.mes)
  push('EFC', c.efc)
  const { proceso } = calcularDerivados({
    periodo_para_registro_y_envio_de_documentos: c.periodo_para_registro_y_envio_de_documentos,
    capacitacion_cedula_a1: c.capacitacion_cedula_a1,
    periodo_para_ingresar_folio_oficina_virtual: c.periodo_para_ingresar_folio_oficina_virtual,
    periodo_para_playbook: c.periodo_para_playbook,
    pre_escuela_sesion_unica_de_arranque: c.pre_escuela_sesion_unica_de_arranque,
    fecha_limite_para_presentar_curricula_cdp: c.fecha_limite_para_presentar_curricula_cdp,
    inicio_escuela_fundamental: c.inicio_escuela_fundamental,
    fecha_tentativa_de_examen: c.fecha_tentativa_de_examen,
    fecha_creacion_ct: c.fecha_creacion_ct
  })
  const procesoLabel = etiquetaProceso(proceso) || ''
  push('Proceso', procesoLabel)
  push('Fecha creación CT', c.fecha_creacion_ct || '')
  push('Fecha tent. examen', c.fecha_tentativa_de_examen || '')
  // Información adicional del candidato
  if (c.email_agente) push('Email agente', c.email_agente)
  if (typeof c.seg_gmm === 'number') push('Seguro GMM', c.seg_gmm)
  if (typeof c.seg_vida === 'number') push('Seguro Vida', c.seg_vida)
  if (c.periodo_para_registro_y_envio_de_documentos) push('Período registro/envío docs', c.periodo_para_registro_y_envio_de_documentos)
  if (c.capacitacion_cedula_a1) push('Capacitación cédula A1', c.capacitacion_cedula_a1)
  if (c.periodo_para_ingresar_folio_oficina_virtual) push('Período folio oficina virtual', c.periodo_para_ingresar_folio_oficina_virtual)
  if (c.periodo_para_playbook) push('Período playbook', c.periodo_para_playbook)
  if (c.pre_escuela_sesion_unica_de_arranque) push('Pre-escuela sesión arranque', c.pre_escuela_sesion_unica_de_arranque)
  if (c.fecha_limite_para_presentar_curricula_cdp) push('Fecha límite curricula CDP', c.fecha_limite_para_presentar_curricula_cdp)
  if (c.inicio_escuela_fundamental) push('Inicio escuela fundamental', c.inicio_escuela_fundamental)
  // @ts-expect-error autoTable inyectada por plugin
  doc.autoTable({
    startY: contentStartY,
    head: [['Campo','Valor']],
    body: rows,
    styles:{ fontSize:8, overflow:'linebreak' },
    theme:'grid',
    headStyles:{ fillColor:[7,46,64], fontSize:8 },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 140, overflow:'linebreak' } },
    margin: { top: headerHeight + 6, left: 14, right: 14 },
    didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
  })

  // Sección: Resumen prospectos y planificación (si es posible obtener agente y datos)
  type AutoTableDoc = typeof doc & { lastAutoTable?: { finalY?: number } }
  const atDoc = doc as AutoTableDoc
  let lastY: number | undefined = atDoc.lastAutoTable?.finalY || contentStartY
  try {
    // Intentar ubicar agente por email
  const emailAgente: string | undefined = c.email_agente || undefined
    let agenteId: number | undefined = undefined
    if (emailAgente) {
      const rAg = await fetch('/api/agentes')
      if (rAg.ok) {
        const agentes: Array<{ id:number; email:string; nombre?:string|null }> = await rAg.json()
        const found = agentes.find(a => a.email?.toLowerCase() === emailAgente.toLowerCase())
        if (found) agenteId = found.id
      }
    }
    if (agenteId) {
      const { anio, semana } = obtenerSemanaIso(new Date())
      const params = new URLSearchParams({ agente_id: String(agenteId), anio: String(anio), semana: String(semana) })
      // Aggregate resumen
      const [rAgg, rCitas, rPlan] = await Promise.all([
        fetch('/api/prospectos/aggregate?' + params.toString()),
        (()=>{ const p2 = new URLSearchParams(params); p2.set('solo_con_cita','1'); return fetch('/api/prospectos?' + p2.toString()) })(),
        fetch('/api/planificacion?' + params.toString())
      ])

      // Construir tablas si hay datos
      let resumen: { total:number; por_estado: Record<string,number> } | undefined
      if (rAgg.ok) {
        const j = await rAgg.json()
        if (j && typeof j.total === 'number' && j.por_estado) resumen = { total: j.total, por_estado: j.por_estado }
      }
      let citas: Prospecto[] = []
      if (rCitas.ok) {
        const arr = await rCitas.json()
        if (Array.isArray(arr)) {
          citas = (arr as Prospecto[]).filter(p=> p.fecha_cita).sort((a,b)=> String(a.fecha_cita).localeCompare(String(b.fecha_cita))).slice(0,5)
        }
      }
      let plan: { bloques: BloquePlanificacion[]; prima_anual_promedio?: number; porcentaje_comision?: number } | undefined
      if (rPlan.ok) {
        const j = await rPlan.json()
        if (j && Array.isArray(j.bloques)) plan = j
      }

      // Dibujar bloque de proceso destacado
      if (procesoLabel) {
        const badgeY = (lastY || contentStartY) + 6
        const text = 'Proceso actual: ' + procesoLabel
        doc.setFont('helvetica','bold'); doc.setFontSize(10)
        const w = Math.min(190, doc.getTextWidth(text) + 10)
        doc.setFillColor(230,245,255)
        doc.setDrawColor(7,46,64)
        doc.roundedRect(12, badgeY, w, 8, 2, 2, 'FD')
        doc.setTextColor(7,46,64)
        doc.text(text, 16, badgeY + 5)
        doc.setTextColor(0,0,0)
        lastY = badgeY + 12
      }

      // Tabla Resumen Prospectos
      if (resumen) {
        const body: Array<[string,string]> = [
          ['Prospectos totales', String(resumen.total)],
          ['Pendiente', String(resumen.por_estado?.pendiente ?? 0)],
          ['Seguimiento', String(resumen.por_estado?.seguimiento ?? 0)],
          ['Con cita', String(resumen.por_estado?.con_cita ?? 0)],
          ['Descartado', String(resumen.por_estado?.descartado ?? 0)]
        ]
        // @ts-expect-error autoTable inyectada por plugin
        doc.autoTable({
          startY: (lastY || contentStartY) + 2,
          head: [['Resumen de prospectos (semana actual)','Valor']],
          body,
          styles: { fontSize:8 },
          theme:'grid',
          headStyles:{ fillColor:[7,46,64], fontSize:8 },
          columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 90 } },
          margin: { top: headerHeight + 6, left: 14, right: 14 },
          didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
        })
  lastY = (atDoc.lastAutoTable?.finalY) || lastY
      }

      // Tabla Próximas citas
      if (citas.length) {
        const head = [['Fecha (MX)','Nombre','Estado']]
        const fmtMX = (iso?: string|null) => {
          if (!iso) return ''
          try {
            const d = new Date(iso)
            const fecha = new Intl.DateTimeFormat('es-MX',{ timeZone:'America/Mexico_City', day:'2-digit', month:'2-digit' }).format(d)
            const hora = new Intl.DateTimeFormat('es-MX',{ timeZone:'America/Mexico_City', hour:'2-digit', minute:'2-digit', hour12:false }).format(d)
            return `${fecha} ${hora}`
          } catch { return String(iso) }
        }
        const body = citas.map(p=> [ fmtMX(p.fecha_cita||null), p.nombre, p.estado ])
        // @ts-expect-error autoTable inyectada por plugin
        doc.autoTable({
          startY: (lastY || contentStartY) + 6,
          head: [['Próximas citas (semana actual)',' ',' '], head[0]],
          body,
          styles: { fontSize:8, overflow:'linebreak' },
          theme:'grid',
          headStyles:{ fillColor:[7,46,64], fontSize:8 },
          columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 100 }, 2: { cellWidth: 40 } },
          margin: { top: headerHeight + 6, left: 14, right: 14 },
          didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
        })
  lastY = (atDoc.lastAutoTable?.finalY) || lastY
      }

      // Tabla Planificación (resumen)
      if (plan && Array.isArray(plan.bloques) && plan.bloques.length) {
        const counts: Record<'PROSPECCION'|'CITAS'|'SMNYL', number> = { PROSPECCION:0, CITAS:0, SMNYL:0 }
        for (const b of plan.bloques as BloquePlanificacion[]) {
          if (b.activity === 'PROSPECCION' || b.activity === 'CITAS' || b.activity === 'SMNYL') counts[b.activity]++
        }
        const resumenBody: Array<[string,string]> = [
          ['Bloques PROSPECCION', String(counts.PROSPECCION)],
          ['Bloques CITAS', String(counts.CITAS)],
          ['Bloques SMNYL', String(counts.SMNYL)],
        ]
        // @ts-expect-error autoTable
        doc.autoTable({
          startY: (lastY || contentStartY) + 6,
          head: [['Resumen planificación (semana actual)','Valor']],
          body: resumenBody,
          styles: { fontSize:8 },
          theme:'grid',
          headStyles:{ fillColor:[7,46,64], fontSize:8 },
          columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 90 } },
          margin: { top: headerHeight + 6, left: 14, right: 14 },
          didDrawPage: () => { drawHeader(); doc.setTextColor(0,0,0) }
        })
  lastY = (atDoc.lastAutoTable?.finalY) || lastY
      }
    }
  } catch {
    // silencioso: si no se puede obtener, omitimos secciones extra
  }

  // Footer de paginación uniforme
  const pageCount: number = (doc as unknown as { internal:{ getNumberOfPages:()=>number } }).internal.getNumberOfPages()
  for(let i=1;i<=pageCount;i++){
    doc.setPage(i)
    doc.setFontSize(7); doc.setTextColor(120)
    doc.text(`Página ${i}/${pageCount}`, 200, 292, {align:'right'})
    doc.text('Lealtia',14,292)
    doc.setTextColor(0,0,0)
  }
  doc.save(`candidato_${c.id_candidato}.pdf`)
}