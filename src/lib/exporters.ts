import type { Candidato } from '@/types'

// Lazy dynamic imports para no inflar el bundle inicial
async function loadXLSX() { return (await import('xlsx')).default }
async function loadJSPDF() { return (await import('jspdf')).jsPDF }
async function loadAutoTable() { return (await import('jspdf-autotable')).default }

export async function exportCandidatosExcel(candidatos: Candidato[]) {
  if (!candidatos.length) return
  const XLSX = await loadXLSX()
  const data = candidatos.map(c => ({
    ID: c.id_candidato,
    CT: c.ct,
    Candidato: c.candidato,
  'Cédula A1': c.mes,
    EFC: c.efc,
    Proceso: c.proceso_actual || '',
    'Fecha creación CT': c.fecha_creacion_ct || '',
    'Días desde creación CT': c.fecha_creacion_ct ? '' : '',
    'Fecha tent. examen': c.fecha_tentativa_de_examen || ''
  }))
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
  doc.setFontSize(14)
  doc.text(`Ficha de Candidato #${c.id_candidato}`, 14, 18)
  doc.setFontSize(10)
  const rows: Array<[string,string]> = []
  const push = (k: string, v: unknown) => rows.push([k, v == null ? '' : String(v)])
  push('CT', c.ct)
  push('Candidato', c.candidato)
  push('Cédula A1', c.mes)
  push('EFC', c.efc)
  push('Proceso', c.proceso_actual || '')
  push('Fecha creación CT', c.fecha_creacion_ct || '')
  push('Fecha tent. examen', c.fecha_tentativa_de_examen || '')
  // @ts-expect-error autoTable inyectada por plugin
  doc.autoTable({ startY: 24, head: [['Campo','Valor']], body: rows, styles:{ fontSize:8 } })
  doc.save(`candidato_${c.id_candidato}.pdf`)
}