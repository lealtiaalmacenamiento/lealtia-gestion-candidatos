import type { Candidato } from '@/types'
import { calcularDerivados, etiquetaProceso } from '@/lib/proceso'

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
  doc.setFontSize(14)
  doc.text(`Ficha de Candidato #${c.id_candidato}`, 14, 18)
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
  push('Proceso', etiquetaProceso(proceso) || '')
  push('Fecha creación CT', c.fecha_creacion_ct || '')
  push('Fecha tent. examen', c.fecha_tentativa_de_examen || '')
  // @ts-expect-error autoTable inyectada por plugin
  doc.autoTable({ startY: 24, head: [['Campo','Valor']], body: rows, styles:{ fontSize:8 } })
  doc.save(`candidato_${c.id_candidato}.pdf`)
}