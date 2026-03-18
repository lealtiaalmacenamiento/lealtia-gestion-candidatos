/**
 * Exporta el Dashboard Ejecutivo a PDF usando jspdf + jspdf-autotable.
 * Uso:
 *   import { exportExecDashboardPDF } from '@/lib/execDashboardExport'
 *   import jsPDF from 'jspdf'
 *   import autoTable from 'jspdf-autotable'
 *   const doc = new jsPDF()
 *   await exportExecDashboardPDF(doc, autoTable, data)
 */

import { formatCurrency } from '@/lib/format'

const BRAND   = [7, 46, 64]   // #072e40
const WHITE   = [255, 255, 255]
const LIGHT   = [245, 248, 250]
const MUTED   = [120, 130, 140]
const MX_TZ   = 'America/Mexico_City'

function nowMX() {
  const d = new Date()
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportExecDashboardPDF(doc: any, autoTable: (...args: any[]) => any, data: ExecDashboardExportData) {
  const PAGE_W  = doc.internal.pageSize.getWidth()  as number
  const PAGE_H  = doc.internal.pageSize.getHeight() as number
  const MARGIN  = 14
  const COL_W   = PAGE_W - MARGIN * 2
  const generado = nowMX()

  // ── Helpers ──────────────────────────────────────────────────────────────
  const lastY = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (doc as any).lastAutoTable?.finalY ?? 0
  }

  function addPageIfNeeded(needed = 20) {
    if (lastY() + needed > PAGE_H - 16) doc.addPage()
  }

  function sectionTitle(title: string, y: number): number {
    addPageIfNeeded(18)
    const useY = lastY() > 0 ? lastY() + 10 : y
    doc.setFillColor(...BRAND)
    doc.rect(MARGIN, useY, COL_W, 7, 'F')
    doc.setFontSize(8.5)
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'bold')
    doc.text(title.toUpperCase(), MARGIN + 3, useY + 5)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
    return useY + 10
  }

  // ── Portada / Encabezado ─────────────────────────────────────────────────
  const logo = await pngToBase64('/Logolealtiaruedabcolor.png').catch(() => null)
    ?? await pngToBase64('/Logolealtiaruedablanca.png').catch(() => null)

  // Franja de color superior
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, PAGE_W, 36, 'F')

  // Logo
  if (logo) {
    try { doc.addImage(logo, 'PNG', MARGIN, 4, 28, 28) } catch { /* sin logo */ }
  }

  // Título
  doc.setFontSize(15)
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.text('Centro de Control — Dashboard Ejecutivo', logo ? MARGIN + 32 : MARGIN, 16)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const periodoLabel = `Periodo: ${data.filters.desde} → ${data.filters.hasta}${data.asesorNombre ? `  ·  Asesor: ${data.asesorNombre}` : ''}`
  doc.text(periodoLabel, logo ? MARGIN + 32 : MARGIN, 24)
  doc.text(`Generado: ${generado}`, logo ? MARGIN + 32 : MARGIN, 31)

  doc.setTextColor(0, 0, 0)

  let y = 44

  // ── KPIs ─────────────────────────────────────────────────────────────────
  if (data.kpis) {
    y = sectionTitle('KPIs del periodo', y)
    const kpiRows = [
      ['Candidatos',             data.kpis.total_candidatos ?? '—'],
      ['Agentes conectados',     data.kpis.total_ganados ?? '—'],
      ['Clientes',               data.kpis.total_clientes ?? '—'],
      ['Pólizas emitidas',       data.kpis.polizas_activas ?? '—'],
      ['Pólizas canceladas',     data.kpis.polizas_canceladas ?? '—'],
      ['Ingreso cobrado',        formatCurrency(Number(data.kpis.ingreso_mxn ?? 0))],
      ['Proyección fin de mes',  formatCurrency(Number(data.kpis.proyeccion_fin_mes ?? 0))],
    ]
    // Two-column layout
    const half = Math.ceil(kpiRows.length / 2)
    const left  = kpiRows.slice(0, half)
    const right = kpiRows.slice(half)
    const colMid = MARGIN + COL_W / 2

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: colMid + 2 },
      head: [['Indicador', 'Valor']],
      body: left,
      theme: 'grid',
      headStyles:      { fillColor: BRAND, fontSize: 7.5, textColor: WHITE, fontStyle: 'bold' },
      bodyStyles:      { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles:    { 0: { cellWidth: 70 }, 1: { cellWidth: 30, halign: 'right', fontStyle: 'bold' } },
    })
    const leftFinalY = lastY()

    autoTable(doc, {
      startY: y,
      margin: { left: colMid + 2, right: MARGIN },
      head: [['Indicador', 'Valor']],
      body: right,
      theme: 'grid',
      headStyles:      { fillColor: BRAND, fontSize: 7.5, textColor: WHITE, fontStyle: 'bold' },
      bodyStyles:      { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles:    { 0: { cellWidth: 70 }, 1: { cellWidth: 30, halign: 'right', fontStyle: 'bold' } },
    })
    // advance y to the lower of the two columns
    // We'll just use lastY naturally from here
    // set a fake lastAutoTable so following sectionTitle picks a good y
    const maxY = Math.max(leftFinalY, lastY())
    ;(doc as any).lastAutoTable = { finalY: maxY }
  }

  // ── Prospectos por estado ─────────────────────────────────────────────────
  if (data.kpis && (
    data.kpis.prospectos_pendiente !== undefined ||
    data.kpis.prospectos_seguimiento !== undefined
  )) {
    sectionTitle('Prospectos por estado', lastY())
    autoTable(doc, {
      startY: lastY(),
      margin: { left: MARGIN, right: MARGIN },
      head: [['Estado', 'Cantidad']],
      body: [
        ['Pendiente',   data.kpis.prospectos_pendiente   ?? 0],
        ['Seguimiento', data.kpis.prospectos_seguimiento ?? 0],
        ['Con cita',    data.kpis.prospectos_con_cita    ?? 0],
        ['Descartado',  data.kpis.prospectos_descartado  ?? 0],
      ],
      theme: 'grid',
      headStyles:      { fillColor: BRAND, fontSize: 7.5, textColor: WHITE, fontStyle: 'bold' },
      bodyStyles:      { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles:    { 1: { halign: 'right' } },
    })
  }

  // ── Embudo de candidatos ──────────────────────────────────────────────────
  if (data.funnel && data.funnel.length > 0) {
    sectionTitle('Embudo de candidatos', lastY())
    autoTable(doc, {
      startY: lastY(),
      margin: { left: MARGIN, right: MARGIN },
      head: [['Fase', 'Total', 'Conv %']],
      body: data.funnel.map(f => [f.label, f.count, f.porcentaje != null ? `${f.porcentaje.toFixed(1)}%` : '—']),
      theme: 'grid',
      headStyles:      { fillColor: BRAND, fontSize: 7.5, textColor: WHITE, fontStyle: 'bold' },
      bodyStyles:      { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles:    { 1: { halign: 'right' }, 2: { halign: 'right' } },
    })
  }

  // ── SLA Tiempos ───────────────────────────────────────────────────────────
  if (data.slaStats) {
    sectionTitle('SLA — Tiempos de atención (prospectos)', lastY())
    const s = data.slaStats
    autoTable(doc, {
      startY: lastY(),
      margin: { left: MARGIN, right: MARGIN },
      head: [['Métrica', 'Valor']],
      body: [
        ['Tiempo promedio primer contacto', s.tiempo_primer_contacto_dias != null ? `${s.tiempo_primer_contacto_dias.toFixed(1)} días` : '—'],
        ['Tiempo promedio a cierre',        s.tiempo_cierre_dias          != null ? `${s.tiempo_cierre_dias.toFixed(1)} días`          : '—'],
        ['Sin primer contacto',             s.sin_primer_contacto],
        ['Muestra total',                   s.muestra_total],
      ],
      theme: 'grid',
      headStyles:      { fillColor: BRAND, fontSize: 7.5, textColor: WHITE, fontStyle: 'bold' },
      bodyStyles:      { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles:    { 1: { halign: 'right' } },
    })
  }

  // ── Citas ─────────────────────────────────────────────────────────────────
  if (data.citasStats) {
    sectionTitle('Citas', lastY())
    const cs = data.citasStats
    autoTable(doc, {
      startY: lastY(),
      margin: { left: MARGIN, right: MARGIN },
      head: [['Estado', 'Cantidad']],
      body: [
        ['Total',       cs.total],
        ['Confirmadas', cs.confirmadas],
        ['Completadas', cs.completadas],
        ['Canceladas',  cs.canceladas],
      ],
      theme: 'grid',
      headStyles:      { fillColor: BRAND, fontSize: 7.5, textColor: WHITE, fontStyle: 'bold' },
      bodyStyles:      { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles:    { 1: { halign: 'right' } },
    })
  }

  // ── Motivos de descarte ───────────────────────────────────────────────────
  if (data.motivosDescarte && data.motivosDescarte.length > 0) {
    sectionTitle('Motivos de descarte', lastY())
    autoTable(doc, {
      startY: lastY(),
      margin: { left: MARGIN, right: MARGIN },
      head: [['Motivo', 'Cantidad']],
      body: data.motivosDescarte.map(m => [m.motivo, m.count]),
      theme: 'grid',
      headStyles:      { fillColor: BRAND, fontSize: 7.5, textColor: WHITE, fontStyle: 'bold' },
      bodyStyles:      { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles:    { 1: { halign: 'right' } },
    })
  }

  // ── Pólizas por tipo ──────────────────────────────────────────────────────
  if (data.polizasPorTipo && data.polizasPorTipo.length > 0) {
    sectionTitle('Pólizas por tipo de producto', lastY())
    autoTable(doc, {
      startY: lastY(),
      margin: { left: MARGIN, right: MARGIN },
      head: [['Tipo', 'Pólizas', 'Prima total']],
      body: data.polizasPorTipo.map(t => [t.tipo, t.count, formatCurrency(t.prima_total)]),
      theme: 'grid',
      headStyles:      { fillColor: BRAND, fontSize: 7.5, textColor: WHITE, fontStyle: 'bold' },
      bodyStyles:      { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles:    { 1: { halign: 'right' }, 2: { halign: 'right' } },
    })
  }

  // ── Pólizas por vencer ────────────────────────────────────────────────────
  if (data.polizasVencer && data.polizasVencer.length > 0) {
    sectionTitle('Pólizas próximas a vencer', lastY())
    autoTable(doc, {
      startY: lastY(),
      margin: { left: MARGIN, right: MARGIN },
      head: [['No. Póliza', 'Cliente', 'Asesor', 'Renovación', 'Días', 'Prima']],
      body: data.polizasVencer.map(p => [
        p.numero_poliza,
        p.cliente,
        p.asesor,
        p.fecha_renovacion,
        p.dias_restantes,
        formatCurrency(p.prima_mxn),
      ]),
      theme: 'grid',
      headStyles:      { fillColor: BRAND, fontSize: 7, textColor: WHITE, fontStyle: 'bold' },
      bodyStyles:      { fontSize: 7.5 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles:    { 4: { halign: 'right' }, 5: { halign: 'right' } },
    })
  }

  // ── Top Asesores ──────────────────────────────────────────────────────────
  if (data.topAsesores && data.topAsesores.length > 0) {
    sectionTitle('Top Asesores', lastY())
    autoTable(doc, {
      startY: lastY(),
      margin: { left: MARGIN, right: MARGIN },
      head: [['#', 'Asesor', 'Clientes', 'Pólizas', 'Prospectos', 'Conv %', 'Cobrado']],
      body: data.topAsesores.map((a, i) => [
        i + 1,
        a.nombre,
        a.clientes_total,
        a.polizas_activas,
        a.candidatos_nuevos,
        `${a.conversion_pct.toFixed(0)}%`,
        formatCurrency(a.ingreso_generado),
      ]),
      theme: 'grid',
      headStyles:      { fillColor: BRAND, fontSize: 7.5, textColor: WHITE, fontStyle: 'bold' },
      bodyStyles:      { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles:    {
        0: { halign: 'center', cellWidth: 8 },
        2: { halign: 'right' }, 3: { halign: 'right' },
        4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'right' },
      },
    })
  }

  // ── Top Clientes ──────────────────────────────────────────────────────────
  if (data.topClientes && data.topClientes.length > 0) {
    sectionTitle('Top Clientes', lastY())
    autoTable(doc, {
      startY: lastY(),
      margin: { left: MARGIN, right: MARGIN },
      head: [['#', 'Cliente', 'Asesor', 'Pólizas', 'Valor total']],
      body: data.topClientes.map((c, i) => [
        i + 1,
        c.nombre,
        c.asesor,
        c.polizas_activas,
        formatCurrency(c.valor_total),
      ]),
      theme: 'grid',
      headStyles:      { fillColor: BRAND, fontSize: 7.5, textColor: WHITE, fontStyle: 'bold' },
      bodyStyles:      { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles:    {
        0: { halign: 'center', cellWidth: 8 },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    })
  }

  // ── Pie de página en todas las páginas ───────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages() as number
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(`Lealtia — Centro de Control  ·  Generado: ${generado}`, MARGIN, PAGE_H - 6)
    doc.text(`Página ${i} / ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' })
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  const filename = `dashboard-ejecutivo_${data.filters.desde}_${data.filters.hasta}.pdf`
  doc.save(filename)
}
