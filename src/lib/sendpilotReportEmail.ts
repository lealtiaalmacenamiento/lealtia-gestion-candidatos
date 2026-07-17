import type { SendPilotCampaignReport } from '@/lib/sendpilotCampaignReport'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function countRows(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (!entries.length) return '<tr><td colspan="2">Sin datos</td></tr>'
  return entries
    .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td style="text-align:right">${value}</td></tr>`)
    .join('')
}

export function buildSendPilotReportEmail(report: SendPilotCampaignReport) {
  const year = new Date().getFullYear()
  const generated = new Date(report.generatedAt).toLocaleString('es-MX', {
    timeZone: process.env.AGENDA_TZ || 'America/Mexico_City',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const logoUrl = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || ''
  const subject = `Reporte SendPilot - ${report.campana.nombre} - ${report.generatedAt.slice(0, 10)}`

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f5f8;font-family:Arial,sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f8;padding:28px 12px;">
    <tr><td align="center">
      <table width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#ffffff;border:1px solid #d9e2ec;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="background:#004481;color:#fff;padding:24px;text-align:center;">
            ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Lealtia" style="max-height:42px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;background:#fff;border-radius:6px;padding:6px;" />` : '<div style="font-weight:700;font-size:20px;margin-bottom:10px;">Lealtia</div>'}
            <h1 style="margin:0;font-size:22px;">Reporte SendPilot</h1>
            <p style="margin:8px 0 0;font-size:14px;">${escapeHtml(report.campana.nombre)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin-top:0;">Se adjunta el CSV con los precandidatos de la campaña, su <strong>lead status</strong> de SendPilot, si recibieron link para agendar y si tienen llamada agendada.</p>
            <p style="font-size:13px;color:#4b5563;">Generado: ${escapeHtml(generated)}</p>

            <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;margin:18px 0;border:1px solid #d9e2ec;">
              <tbody>
                <tr><td style="background:#f8fafc;"><strong>Total filas</strong></td><td style="text-align:right">${report.summary.totalRows}</td></tr>
                <tr><td style="background:#f8fafc;"><strong>Leads en SendPilot</strong></td><td style="text-align:right">${report.summary.totalSendPilotLeads}</td></tr>
                <tr><td style="background:#f8fafc;"><strong>Precandidatos en CRM</strong></td><td style="text-align:right">${report.summary.totalCrmPrecandidatos}</td></tr>
                <tr><td style="background:#f8fafc;"><strong>Links enviados</strong></td><td style="text-align:right">${report.summary.linkCounts.si}</td></tr>
                <tr><td style="background:#f8fafc;"><strong>Llamadas agendadas</strong></td><td style="text-align:right">${report.summary.callCounts.si}</td></tr>
              </tbody>
            </table>

            <h2 style="font-size:16px;margin:22px 0 8px;">Lead status</h2>
            <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #d9e2ec;">
              <thead><tr style="background:#f8fafc;"><th align="left">Status</th><th align="right">Cantidad</th></tr></thead>
              <tbody>${countRows(report.summary.statusCounts)}</tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f4f4f4;color:#555;font-size:12px;padding:16px;text-align:center;">
            © ${year} Lealtia — Todos los derechos reservados
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    `Reporte SendPilot - ${report.campana.nombre}`,
    `Generado: ${generated}`,
    `Total filas: ${report.summary.totalRows}`,
    `Leads en SendPilot: ${report.summary.totalSendPilotLeads}`,
    `Precandidatos en CRM: ${report.summary.totalCrmPrecandidatos}`,
    `Links enviados: ${report.summary.linkCounts.si}`,
    `Llamadas agendadas: ${report.summary.callCounts.si}`,
    `Adjunto: ${report.filename}`,
  ].join('\n')

  return { subject, html, text }
}

