/**
 * Exporta el Dashboard Ejecutivo a PDF usando jspdf + jspdf-autotable.
 * Importacion dinamica recomendada:
 *   const { default: jsPDF }     = await import('jspdf')
 *   const { default: autoTable } = await import('jspdf-autotable')
 *   const doc = new jsPDF()
 *   await exportExecDashboardPDF(doc, autoTable, data)
 *
 * NOTA: usa un tracker de Y explicito para evitar desfases cuando se dibujan
 * elementos visuales (rectangulos, texto) sin pasar por autoTable.
 */

import { formatCurrency } from '@/lib/format'

const BRAND  = [7, 46, 64]        // #072e40
const WHITE  = [255, 255, 255]
const LIGHT  = [245, 248, 250]
const MUTED  = [120, 130, 140]
const MX_TZ  = 'America/Mexico_City'

function nowMX() {
  const d     = new Date()
  const fecha = new Intl.DateTimeFormat('es-MX', { timeZone: MX_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
  const hora  = new Intl.DateTimeFormat('es-MX', { timeZone: MX_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${fecha} ${hora}`
}

async function pngToBase64(url: string): Promise<string | null> {
  try {
    const res  = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror   = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

//  Tipos publicos 
export interface ExecDashboardExportData {
  filters:         { desde: string; hasta: string; asesorAuthId: string | null }
  asesorNombre:    string | null
  kpis:            Record<string, number | string | null> | null
  funnel:          Array<{ label: string; count: number; porcentaje?: number }> | null
  slaStats:        { tiempo_primer_contacto_dias: number | null; tiempo_cierre_dias: number | null; sin_primer_contacto: number; muestra_total: number } | null
  citasStats:      { total: number; confirmadas: number; completadas: number; canceladas: number } | null
  motivosDescarte: Array<{ motivo: string; count: number }>
  polizasPorTipo:  Array<{ tipo: string; count: number; prima_total: number }>
  polizasVencer:   Array<{ numero_poliza: string; cliente: string; asesor: string; fecha_renovacion: string; dias_restantes: number; prima_mxn: number; tipo_producto: string }>
  topAsesores:     Array<{ nombre: string; clientes_total: number; polizas_activas: number; candidatos_nuevos: number; conversion_pct: number; ingreso_generado: number }>
  topClientes:     Array<{ nombre: string; asesor: string; polizas_activas: number; valor_total: number }>
}

export async function exportExecDashboardPDF(doc: any, autoTable: (...args: any[]) => any, data: ExecDashboardExportData) {
  const PAGE_W   = doc.internal.pageSize.getWidth()  as number
  const PAGE_H   = doc.internal.pageSize.getHeight() as number
  const MARGIN   = 14
  const COL_W    = PAGE_W - MARGIN * 2
  const FOOTER_H = 14   // espacio reservado en pie de pagina
  const generado = nowMX()

  //  Y tracker explicito 
  // `y` siempre apunta al proximo punto libre DESPUES del ultimo elemento
  // dibujado. Se actualiza despues de cada sectionTitle y de cada autoTable.
  let y = 0

  /** Dibuja la franja de titulo de seccion y avanza y. */
  function sectionTitle(title: string) {
    const needed = 20  // altura minima: titulo (9) + al menos una fila (11)
    if (y + needed > PAGE_H - FOOTER_H) {
      doc.addPage()
      y = 14
    } else {
      y += 8  // separacion entre seccion anterior y este titulo
    }
    doc.setFillColor(...BRAND)
    doc.rect(MARGIN, y, COL_W, 7, 'F')
    doc.setFontSize(8.5)
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'bold')
    doc.text(title.toUpperCase(), MARGIN + 3, y + 5)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
    y += 9  // justo debajo de la franja; startY para la siguiente tabla
  }

  /** Envuelve autoTable actualizando y al terminar. */
  function tbl(opts: object) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      ...opts,
    })
    y = (doc as any).lastAutoTable?.finalY ?? y
  }

  // Estilos reutilizables
  const headStyles  = { fillColor: BRAND, fontSize: 7.5, textColor: WHITE, fontStyle: 'bold' as const }
  const bodyStyles  = { fontSize: 8 }
  const altStyles   = { fillColor: LIGHT }

  //  1. ENCABEZADO 
  // Usar el logo blanco primero porque va sobre fondo oscuro
  const logo = await pngToBase64('/Logolealtiaruedablanca.png').catch(() => null)
    ?? await pngToBase64('/Logolealtiaruedabcolor.png').catch(() => null)

  doc.setFillColor(...BRAND)
  doc.rect(0, 0, PAGE_W, 38, 'F')

  if (logo) {
    try { doc.addImage(logo, 'PNG', MARGIN, 5, 26, 26) } catch { /* sin logo */ }
  }

  const textX = logo ? MARGIN + 30 : MARGIN
  doc.setFontSize(14)
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.text('Centro de Control - Dashboard Ejecutivo', textX, 16)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`Periodo: ${data.filters.desde} -> ${data.filters.hasta}${data.asesorNombre ? `  |  Asesor: ${data.asesorNombre}` : ''}`, textX, 25)
  doc.text(`Generado: ${generado}`, textX, 32)
  doc.setTextColor(0, 0, 0)

  y = 48  // primer y libre despues del encabezado

  //  2. KPIs 
  if (data.kpis) {
    const k = data.kpis
    sectionTitle('KPIs del periodo')
    tbl({
      head: [['Indicador', 'Valor']],
      body: [
        ['Candidatos',            String(k.total_candidatos   ?? 0)],
        ['Agentes conectados',    String(k.total_ganados      ?? 0)],
        ['Clientes',              String(k.total_clientes     ?? 0)],
        ['Polizas emitidas',      String(k.polizas_activas    ?? 0)],
        ['Polizas canceladas',    String(k.polizas_canceladas ?? 0)],
        ['Ingreso cobrado',       formatCurrency(Number(k.ingreso_mxn        ?? 0))],
        ['Proyeccion fin de mes', formatCurrency(Number(k.proyeccion_fin_mes ?? 0))],
      ],
      theme: 'grid',
      headStyles,
      bodyStyles,
      alternateRowStyles: altStyles,
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    })
  }

  //  3. PROSPECTOS POR ESTADO 
  if (data.kpis && data.kpis.prospectos_pendiente !== undefined) {
    const k = data.kpis
    sectionTitle('Prospectos por estado')
    tbl({
      head: [['Estado', 'Cantidad']],
      body: [
        ['Pendiente',   String(k.prospectos_pendiente   ?? 0)],
        ['Seguimiento', String(k.prospectos_seguimiento ?? 0)],
        ['Con cita',    String(k.prospectos_con_cita    ?? 0)],
        ['Descartado',  String(k.prospectos_descartado  ?? 0)],
      ],
      theme: 'grid',
      headStyles,
      bodyStyles,
      alternateRowStyles: altStyles,
      columnStyles: { 1: { halign: 'right' } },
    })
  }

  //  4. EMBUDO 
  if (data.funnel && data.funnel.length > 0) {
    sectionTitle('Embudo de candidatos')
    tbl({
      head: [['Fase', 'Total', 'Conv %']],
      body: data.funnel.map(f => [
        f.label,
        String(f.count),
        f.porcentaje != null ? `${f.porcentaje.toFixed(1)}%` : 'N/D',
      ]),
      theme: 'grid',
      headStyles,
      bodyStyles,
      alternateRowStyles: altStyles,
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    })
  }

  //  5. SLA 
  if (data.slaStats) {
    const s = data.slaStats
    sectionTitle('SLA - Tiempos de atencion')
    tbl({
      head: [['Metrica', 'Valor']],
      body: [
        ['Tiempo promedio primer contacto', s.tiempo_primer_contacto_dias != null ? `${s.tiempo_primer_contacto_dias.toFixed(1)} dias` : 'N/D'],
        ['Tiempo promedio a cierre',        s.tiempo_cierre_dias          != null ? `${s.tiempo_cierre_dias.toFixed(1)} dias`          : 'N/D'],
        ['Sin primer contacto',             String(s.sin_primer_contacto)],
        ['Muestra total',                   String(s.muestra_total)],
      ],
      theme: 'grid',
      headStyles,
      bodyStyles,
      alternateRowStyles: altStyles,
      columnStyles: { 1: { halign: 'right' } },
    })
  }

  //  6. CITAS 
  if (data.citasStats) {
    const cs = data.citasStats
    sectionTitle('Citas')
    tbl({
      head: [['Estado', 'Cantidad']],
      body: [
        ['Total',       String(cs.total)],
        ['Confirmadas', String(cs.confirmadas)],
        ['Completadas', String(cs.completadas)],
        ['Canceladas',  String(cs.canceladas)],
      ],
      theme: 'grid',
      headStyles,
      bodyStyles,
      alternateRowStyles: altStyles,
      columnStyles: { 1: { halign: 'right' } },
    })
  }

  //  7. MOTIVOS DE DESCARTE 
  if (data.motivosDescarte && data.motivosDescarte.length > 0) {
    sectionTitle('Motivos de descarte')
    tbl({
      head: [['Motivo', 'Cantidad']],
      body: data.motivosDescarte.map(m => [m.motivo, String(m.count)]),
      theme: 'grid',
      headStyles,
      bodyStyles,
      alternateRowStyles: altStyles,
      columnStyles: { 1: { halign: 'right' } },
    })
  }

  //  8. POLIZAS POR TIPO 
  if (data.polizasPorTipo && data.polizasPorTipo.length > 0) {
    sectionTitle('Polizas por tipo de producto')
    tbl({
      head: [['Tipo', 'Polizas', 'Prima total']],
      body: data.polizasPorTipo.map(t => [t.tipo, String(t.count), formatCurrency(t.prima_total)]),
      theme: 'grid',
      headStyles,
      bodyStyles,
      alternateRowStyles: altStyles,
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    })
  }

  //  9. POLIZAS POR VENCER 
  if (data.polizasVencer && data.polizasVencer.length > 0) {
    sectionTitle('Polizas proximas a vencer')
    tbl({
      head: [['No. Poliza', 'Cliente', 'Asesor', 'Renovacion', 'Dias', 'Prima']],
      body: data.polizasVencer.map(p => [
        p.numero_poliza,
        p.cliente,
        p.asesor,
        p.fecha_renovacion,
        String(p.dias_restantes),
        formatCurrency(p.prima_mxn),
      ]),
      theme: 'grid',
      headStyles: { ...headStyles, fontSize: 7 },
      bodyStyles: { fontSize: 7.5 },
      alternateRowStyles: altStyles,
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
    })
  }

  //  10. TOP ASESORES 
  if (data.topAsesores && data.topAsesores.length > 0) {
    sectionTitle('Top Asesores')
    tbl({
      head: [['#', 'Asesor', 'Clientes', 'Polizas', 'Prospectos', 'Conv %', 'Cobrado']],
      body: data.topAsesores.map((a, i) => [
        String(i + 1),
        a.nombre,
        String(a.clientes_total),
        String(a.polizas_activas),
        String(a.candidatos_nuevos),
        `${Number(a.conversion_pct).toFixed(0)}%`,
        formatCurrency(a.ingreso_generado),
      ]),
      theme: 'grid',
      headStyles,
      bodyStyles,
      alternateRowStyles: altStyles,
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        2: { halign: 'right' }, 3: { halign: 'right' },
        4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'right' },
      },
    })
  }

  //  11. TOP CLIENTES 
  if (data.topClientes && data.topClientes.length > 0) {
    sectionTitle('Top Clientes')
    tbl({
      head: [['#', 'Cliente', 'Asesor', 'Polizas', 'Valor total']],
      body: data.topClientes.map((c, i) => [
        String(i + 1),
        c.nombre,
        c.asesor,
        String(c.polizas_activas),
        formatCurrency(c.valor_total),
      ]),
      theme: 'grid',
      headStyles,
      bodyStyles,
      alternateRowStyles: altStyles,
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    })
  }

  //  PIE DE PAGINA EN TODAS LAS PAGINAS 
  const totalPages = doc.internal.getNumberOfPages() as number
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(`Lealtia - Centro de Control  |  Generado: ${generado}`, MARGIN, PAGE_H - 6)
    doc.text(`Pagina ${i} / ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' })
  }

  //  GUARDAR 
  const filename = `dashboard-ejecutivo_${data.filters.desde}_${data.filters.hasta}.pdf`
  doc.save(filename)
}
