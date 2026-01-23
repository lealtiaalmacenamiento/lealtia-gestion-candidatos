/**
 * Exportador de PDF para reporte general de Clientes y Pólizas
 * Incluye:
 * - Resumen general por asesor
 * - Detalle de clientes y sus pólizas
 * - Totales de comisiones y cantidades
 */

export async function pngToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('No se pudo convertir la imagen a base64.'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface JsPDFWithAutoTable {
  lastAutoTable?: { finalY?: number }
  internal: {
    pageSize: { getHeight: () => number }
    getNumberOfPages: () => number
  }
  setPage: (n: number) => void
  setFontSize: (n: number) => void
  setTextColor: (...args: number[]) => void
  setFont: (font: string, style: string) => void
  setFillColor: (...args: number[]) => void
  text: (text: string | string[], x: number, y: number, options?: any) => void
  rect: (x: number, y: number, w: number, h: number, style?: string) => void
  addImage: (imageData: string, format: string, x: number, y: number, width: number, height: number) => void
  getTextWidth: (text: string) => number
  getImageProperties: (imageData: string) => { width: number; height: number }
}

const MX_TZ = 'America/Mexico_City'
function nowMX() {
  const d = new Date()
  const fecha = new Intl.DateTimeFormat('es-MX', { timeZone: MX_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
  const hora = new Intl.DateTimeFormat('es-MX', { timeZone: MX_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${fecha} ${hora}`
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val)
}

interface ClientePoliza {
  cliente_nombre: string
  asesor_nombre: string
  asesor_email: string
  comision_total_asesor: number
  polizas: Array<{
    numero_poliza: string
    producto_nombre: string
    periodicidad: string
    estatus: string
    prima: number
    comision_vigente: number
    pagos_realizados: number
    pagos_totales: number
  }>
}

interface ReporteData {
  clientes: ClientePoliza[]
}

interface PdfOptions {
  titulo?: string
  logo?: string
  logoW?: number
  logoH?: number
}

export async function exportGestionPDF(
  doc: any,
  data: ReporteData,
  autoTable: (...args: any[]) => any,
  options: PdfOptions = {}
) {
  const {
    titulo = 'Reporte General de Clientes y Pólizas',
    logo,
    logoW = 32,
    logoH = 32
  } = options

  const generadoEn = nowMX()
  const docTyped = doc as unknown as JsPDFWithAutoTable

  // Configuración de márgenes y layout
  const marginLeft = 14
  const marginRight = 14
  const marginTop = 10
  const marginBottom = 10
  const pageWidth = 210 // A4
  const pageHeight = 297 // A4

  let yPosition = marginTop

  // Función para verificar espacio disponible y agregar página si es necesario
  const checkPageBreak = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - marginBottom) {
      doc.addPage()
      yPosition = marginTop
      drawHeader()
      yPosition += headerHeight + 5
      return true
    }
    return false
  }

  // Header
  let headerHeight = 22
  const drawHeader = () => {
    const baseX = logo ? 50 : marginLeft
    const marginRightHeader = 8
    const maxWidth = pageWidth - baseX - marginRightHeader

    let fontSize = 13
    doc.setFont('helvetica', 'bold')
    let width = 0
    while (fontSize >= 8) {
      doc.setFontSize(fontSize)
      width = doc.getTextWidth(titulo)
      if (width <= maxWidth) break
      fontSize--
    }

    let lines: string[] = []
    if (width > maxWidth) {
      const words = titulo.split(/\s+/)
      let current = ''
      words.forEach(w => {
        const test = current ? current + ' ' + w : w
        const testW = doc.getTextWidth(test)
        if (testW <= maxWidth) current = test
        else {
          if (current) lines.push(current)
          current = w
        }
      })
      if (current) lines.push(current)
    } else {
      lines = [titulo]
    }

    const lineHeight = fontSize + 2
    const dateFontSize = 8
    const neededHeight = 6 + lines.length * lineHeight + 2 + dateFontSize + 6
    if (neededHeight > headerHeight) headerHeight = neededHeight

    // Fondo del header
    doc.setFillColor(7, 46, 64)
    doc.rect(0, 0, pageWidth, headerHeight, 'F')

    // Logo
    if (logo && logoW && logoH) {
      try {
        const props = doc.getImageProperties(logo)
        const aspect = props.width / props.height
        let drawW = logoW
        let drawH = logoH
        if (logoW / logoH > aspect) {
          drawW = logoH * aspect
          drawH = logoH
        } else {
          drawW = logoW
          drawH = logoW / aspect
        }
        doc.addImage(logo, 'PNG', 10, (headerHeight - drawH) / 2, drawW, drawH)
      } catch {
        /* ignore */
      }
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(255, 255, 255)
      doc.text('LOGO', 12, 14)
    }

    // Título
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(fontSize)
    lines.forEach((l, i) => {
      const baseline = 6 + (i + 1) * lineHeight - (lineHeight - fontSize) / 2
      doc.text(l, baseX, baseline)
    })

    // Fecha de generación
    const dateY = 6 + lines.length * lineHeight + 2 + dateFontSize
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(dateFontSize)
    doc.setTextColor(200, 200, 200)
    doc.text(`Generado: ${generadoEn}`, baseX, dateY)
  }

  // Dibujar header inicial
  drawHeader()
  yPosition = headerHeight + 8

  // Footer con paginación
  const drawFooter = () => {
    const totalPages = docTyped.internal.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      docTyped.setPage(i)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      const footerText = `Página ${i} de ${totalPages}`
      const textWidth = doc.getTextWidth(footerText)
      doc.text(footerText, (pageWidth - textWidth) / 2, pageHeight - 8)
    }
  }

  // Agrupar por asesor
  const porAsesor = new Map<string, ClientePoliza[]>()
  data.clientes.forEach(cliente => {
    const key = `${cliente.asesor_nombre} (${cliente.asesor_email})`
    if (!porAsesor.has(key)) {
      porAsesor.set(key, [])
    }
    porAsesor.get(key)!.push(cliente)
  })

  // Totales generales
  let totalGeneralPolizas = 0
  let totalGeneralPrimas = 0
  let totalGeneralComisiones = 0

  data.clientes.forEach(cliente => {
    cliente.polizas.forEach(poliza => {
      totalGeneralPolizas++
      totalGeneralPrimas += poliza.prima || 0
      totalGeneralComisiones += poliza.comision_vigente || 0
    })
  })

  // Resumen general
  checkPageBreak(40)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(7, 46, 64)
  doc.text('Resumen General', marginLeft, yPosition)
  yPosition += 8

  autoTable(doc, {
    startY: yPosition,
    margin: { left: marginLeft, right: marginRight },
    head: [['Concepto', 'Cantidad']],
    body: [
      ['Total Clientes', data.clientes.length.toString()],
      ['Total Pólizas', totalGeneralPolizas.toString()],
      ['Prima Total', formatCurrency(totalGeneralPrimas)],
      ['Comisión Total', formatCurrency(totalGeneralComisiones)]
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [7, 46, 64],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10
    },
    bodyStyles: {
      fontSize: 9
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 102, halign: 'right' }
    }
  })

  yPosition = (docTyped.lastAutoTable?.finalY || yPosition) + 12

  // Detalle por asesor
  for (const [asesorKey, clientes] of porAsesor.entries()) {
    checkPageBreak(50)

    // Título del asesor
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(7, 46, 64)
    doc.text(`Asesor: ${asesorKey}`, marginLeft, yPosition)
    yPosition += 8

    // Totales del asesor
    let totalAsesorPolizas = 0
    let totalAsesorPrimas = 0
    let totalAsesorComisiones = 0

    clientes.forEach(cliente => {
      cliente.polizas.forEach(poliza => {
        totalAsesorPolizas++
        totalAsesorPrimas += poliza.prima || 0
        totalAsesorComisiones += poliza.comision_vigente || 0
      })
    })

    // Tabla resumen del asesor
    autoTable(doc, {
      startY: yPosition,
      margin: { left: marginLeft + 10, right: marginRight },
      head: [['Clientes', 'Pólizas', 'Prima Total', 'Comisión Total']],
      body: [[
        clientes.length.toString(),
        totalAsesorPolizas.toString(),
        formatCurrency(totalAsesorPrimas),
        formatCurrency(totalAsesorComisiones)
      ]],
      theme: 'grid',
      headStyles: {
        fillColor: [50, 100, 150],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8,
        halign: 'right'
      }
    })

    yPosition = (docTyped.lastAutoTable?.finalY || yPosition) + 10

    // Detalle de cada cliente
    for (const cliente of clientes) {
      checkPageBreak(30)

      // Nombre del cliente
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text(`Cliente: ${cliente.cliente_nombre}`, marginLeft + 15, yPosition)
      yPosition += 6

      // Tabla de pólizas del cliente
      const polizasBody = cliente.polizas.map(p => [
        p.numero_poliza || '-',
        p.producto_nombre || '-',
        p.periodicidad || '-',
        p.estatus || '-',
        `${p.pagos_realizados}/${p.pagos_totales}`,
        formatCurrency(p.prima || 0),
        formatCurrency(p.comision_vigente || 0)
      ])

      autoTable(doc, {
        startY: yPosition,
        margin: { left: marginLeft + 20, right: marginRight },
        head: [['# Póliza', 'Producto', 'Period.', 'Estatus', 'Pagos', 'Prima', 'Comisión']],
        body: polizasBody,
        theme: 'striped',
        headStyles: {
          fillColor: [100, 150, 200],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8
        },
        bodyStyles: {
          fontSize: 7
        },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 34 },
          2: { cellWidth: 18, halign: 'center' },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 16, halign: 'center' },
          5: { cellWidth: 24, halign: 'right' },
          6: { cellWidth: 24, halign: 'right' }
        }
      })

      yPosition = (docTyped.lastAutoTable?.finalY || yPosition) + 8
    }

    yPosition += 5 // Espacio entre asesores
  }

  // Dibujar footers con paginación
  drawFooter()
}
