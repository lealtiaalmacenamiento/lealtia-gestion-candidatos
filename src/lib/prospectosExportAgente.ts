import type { Prospecto } from '@/types'
import autoTable from 'jspdf-autotable'

/**
 * Exporta el reporte de prospectos para un solo agente a PDF.
 * El layout es compacto y solo incluye la información del agente seleccionado.
 * No afecta el reporte general.
 */
export async function exportProspectosPDFAgente(
  doc: any,
  prospectos: Prospecto[],
  opts: any,
  autoTableLib: typeof autoTable,
  titulo: string,
  logo?: string,
  logoW: number = 32,
  logoH: number = 32
) {
  // Header
  const generadoEn = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
  doc.setFont('helvetica','bold');
  doc.setFontSize(13);
  doc.setFillColor(7,46,64); doc.rect(0,0,210,22,'F');
  if(logo && logoW && logoH){
    try { doc.addImage(logo, 'PNG', 10, 3, logoW, logoH); } catch {/*ignore*/}
  }
  doc.setTextColor(255,255,255);
  doc.text(titulo, 50, 14);
  doc.setFontSize(8);
  doc.text('Generado (CDMX): '+ generadoEn, 50, 20);
  doc.setTextColor(0,0,0);
  let y = 32;

  // Resumen del agente
  const agenteId = opts?.agenteId;
  const agentesMap = opts?.agentesMap || {};
  const nombre = agentesMap[agenteId] || agenteId;
  const agPros = prospectos.filter(p => p.agente_id === agenteId);
  const previas = opts?.perAgentPrevCounts?.[agenteId] ?? 0;
  const total = agPros.length + previas;
  const pendiente = agPros.filter(p => p.estado === 'pendiente').length;
  const seguimiento = agPros.filter(p => p.estado === 'seguimiento').length;
  const conCita = agPros.filter(p => p.estado === 'con_cita').length;
  const descartado = agPros.filter(p => p.estado === 'descartado').length;
  const clientes = agPros.filter(p => p.estado === 'ya_es_cliente').length;
  autoTableLib(doc, {
    startY: y,
    head: [['Agente','Total','Pendiente','Seguimiento','Con cita','Descartado','Clientes','Previas']],
    body: [[nombre, total, pendiente, seguimiento, conCita, descartado, clientes, previas]],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [7, 46, 64], fontSize: 10, textColor: [255, 255, 255], halign: 'center' },
    alternateRowStyles: { fillColor: [245, 247, 248] },
    theme: 'grid',
    margin: { left: 14, right: 14 },
    tableWidth: 'wrap',
  });
  y = doc.lastAutoTable.finalY + 10;

  // Tabla de prospectos de la semana
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.text('Prospectos de la semana', 14, y);
  y += 4;
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  autoTableLib(doc, {
    startY: y,
    head: [['Nombre','Teléfono','Estado','Notas']],
    body: agPros.map(p => [p.nombre, p.telefono || '', p.estado, (p.notas || '').slice(0, 120)]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [7, 46, 64], fontSize: 8, textColor: [255, 255, 255], halign: 'center' },
    alternateRowStyles: { fillColor: [245, 247, 248] },
    theme: 'grid',
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  // Puedes agregar más secciones aquí según lo que necesites mostrar para el agente

  // Footer
  const pageCount: number = doc.internal.getNumberOfPages();
  for(let i=1;i<=pageCount;i++){
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(120); doc.text(`Página ${i}/${pageCount}`, 200, 290, {align:'right'}); doc.text('Lealtia',14,290); doc.setTextColor(0,0,0)
  }
  // Guardar
  const desired = opts?.filename || titulo.replace(/\s+/g,'_').toLowerCase()+'.pdf';
  doc.save(desired);
}
