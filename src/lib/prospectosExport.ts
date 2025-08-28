import type { Prospecto } from '@/types'

async function loadJSPDF() { return (await import('jspdf')).jsPDF }
async function loadAutoTable() { return (await import('jspdf-autotable')).default }

export async function exportProspectosPDF(prospectos: Prospecto[], resumen: { total:number; por_estado: Record<string,number>; cumplimiento_30:boolean }, titulo: string){
  if(!prospectos.length) return
  const jsPDF = await loadJSPDF(); await loadAutoTable()
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(titulo,14,16)
  doc.setFontSize(9)
  const body = prospectos.map(p=> [p.id, p.nombre, p.telefono||'', p.estado, p.fecha_cita||'', (p.notas||'').slice(0,80)])
  // @ts-expect-error autotable plugin
  doc.autoTable({ startY:22, head: [['ID','Nombre','Teléfono','Estado','Fecha Cita','Notas']], body, styles:{ fontSize:7 }, headStyles:{ fillColor:[7,46,64] } })
    interface DocMaybeAuto { lastAutoTable?: { finalY?: number } }
    const docWith = doc as unknown as DocMaybeAuto
    let y = docWith.lastAutoTable?.finalY || 24
  y += 6
  doc.setFontSize(10)
  doc.text('Resumen',14,y)
  y += 4
  const lines = [
    `Total: ${resumen.total}`,
    `Pendiente: ${resumen.por_estado.pendiente||0}`,
    `Seguimiento: ${resumen.por_estado.seguimiento||0}`,
    `Con cita: ${resumen.por_estado.con_cita||0}`,
    `Descartado: ${resumen.por_estado.descartado||0}`,
    `Cumplimiento 30: ${resumen.cumplimiento_30? 'SI':'NO'}`
  ]
  lines.forEach(l=> { doc.text(l,14,y); y+=4 })
  doc.save('prospectos.pdf')
}