// Felicitación por 2 citas confirmadas en un día
const DEFAULT_TIMEZONE = process.env.AGENDA_TZ || 'America/Mexico_City'

function formatDateRange(inicioIso: string, finIso: string, tz: string = DEFAULT_TIMEZONE) {
  try {
    const inicio = new Date(inicioIso)
    const fin = new Date(finIso)
    const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeZone: tz })
    const timeFormatter = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    const fecha = dateFormatter.format(inicio)
    const horaInicio = timeFormatter.format(inicio)
    const horaFin = timeFormatter.format(fin)
    return { fecha, horaInicio, horaFin }
  } catch {
    return { fecha: inicioIso, horaInicio: inicioIso, horaFin: finIso }
  }
}

function humanizeProvider(provider: string) {
  switch (provider) {
    case 'google_meet':
      return 'Google Meet'
    case 'zoom':
      return 'Zoom'
    default:
      return provider
  }
}

export function buildFelicitacionCitasEmail(nombreAgente: string, fecha: string, total: number) {
  const subject = `¡Felicidades por agendar ${total} citas confirmadas en un solo día!`;
  const year = new Date().getFullYear();
  const LOGO_URL = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || 'https://via.placeholder.com/140x50?text=Lealtia';
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
    <div style="background-color:#004481;color:#fff;padding:16px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">¡Felicidades!</h2>
    </div>
    <div style="padding:24px;background-color:#fff;">
      <p>Hola <strong>${nombreAgente}</strong>,</p>
      <p>¡Te felicitamos por haber agendado <b>${total} citas confirmadas</b> el día <b>${fecha}</b>!</p>
      <p>Este logro refleja tu dedicación y compromiso. ¡Sigue así!</p>
    </div>
    <div style="background-color:#f4f4f4;color:#555;font-size:12px;padding:16px;text-align:center;line-height:1.4">
      <p>© ${year} Lealtia — Todos los derechos reservados</p>
      <p>Este mensaje es confidencial y para uso exclusivo del destinatario.</p>
    </div>
  </div>`;
  const text = `¡Felicidades ${nombreAgente}!\nHas agendado ${total} citas confirmadas el día ${fecha}.\n¡Sigue así!\n© ${year} Lealtia`;
  return { subject, html, text };
}
// Felicitación por 2 citas confirmadas cada día de la semana
export function buildFelicitacionSemanaCitasEmail(nombreAgente: string, semana: string) {
  const subject = `¡Felicidades por lograr 2 o más citas confirmadas cada día de la semana!`;

  const year = new Date().getFullYear();
  const LOGO_URL = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || 'https://via.placeholder.com/140x50?text=Lealtia';
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
    <div style="background-color:#004481;color:#fff;padding:16px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">¡Felicidades!</h2>
    </div>
    <div style="padding:24px;background-color:#fff;">
      <p>Hola <strong>${nombreAgente}</strong>,</p>
      <p>¡Te felicitamos por haber registrado al menos <b>2 citas confirmadas cada día</b> durante la semana <b>${semana}</b>!</p>
      <p>Este logro demuestra constancia y excelencia. ¡Sigue así!</p>
    </div>
    <div style="background-color:#f4f4f4;color:#555;font-size:12px;padding:16px;text-align:center;line-height:1.4">
      <p>© ${year} Lealtia — Todos los derechos reservados</p>
      <p>Este mensaje es confidencial y para uso exclusivo del destinatario.</p>
    </div>
  </div>`;
  const text = `¡Felicidades ${nombreAgente}!
Has registrado al menos 2 citas confirmadas cada día durante la semana ${semana}.
¡Sigue así!
© ${year} Lealtia`;
  return { subject, html, text };
}

export function buildCitaConfirmacionEmail(opts: {
  nombreAgente: string
  emailAgente: string
  inicio: string
  fin: string
  meetingUrl: string
  meetingProvider: string
  nombreProspecto?: string | null
  supervisorNombre?: string | null
  solicitante?: string | null
  timezone?: string | null
}) {
  const tz = opts.timezone || DEFAULT_TIMEZONE
  const { fecha, horaInicio, horaFin } = formatDateRange(opts.inicio, opts.fin, tz)
  const subject = `Cita confirmada — ${fecha} ${horaInicio}`
  const year = new Date().getFullYear()
  const LOGO_URL = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || 'https://via.placeholder.com/140x50?text=Lealtia'
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
    <div style="background-color:#004481;color:#fff;padding:16px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">Cita confirmada</h2>
    </div>
    <div style="padding:24px;background-color:#fff;">
      <p>Hola <strong>${opts.nombreAgente || opts.emailAgente}</strong>,</p>
      <p>Tu cita ha sido confirmada para el <strong>${fecha}</strong> de <strong>${horaInicio}</strong> a <strong>${horaFin}</strong> (${tz}).</p>
      ${opts.nombreProspecto ? `<p><strong>Prospecto:</strong> ${opts.nombreProspecto}</p>` : ''}
  <p><strong>Enlace:</strong> <a href="${opts.meetingUrl}" style="color:#004481">${opts.meetingUrl}</a></p>
  <p><strong>Plataforma:</strong> ${humanizeProvider(opts.meetingProvider)}</p>
      ${opts.supervisorNombre ? `<p><strong>Supervisor:</strong> ${opts.supervisorNombre}</p>` : ''}
      ${opts.solicitante ? `<p>Solicitada por: ${opts.solicitante}</p>` : ''}
    </div>
    <div style="background-color:#f4f4f4;color:#555;font-size:12px;padding:16px;text-align:center;line-height:1.4">
      <p>© ${year} Lealtia — Todos los derechos reservados</p>
      <p>Este mensaje es confidencial y para uso exclusivo del destinatario.</p>
    </div>
  </div>`
  const textLines = [
    `Cita confirmada`,
    `Fecha: ${fecha}`,
    `Horario: ${horaInicio} - ${horaFin} (${tz})`,
    opts.nombreProspecto ? `Prospecto: ${opts.nombreProspecto}` : undefined,
    `Enlace: ${opts.meetingUrl}`,
  `Plataforma: ${humanizeProvider(opts.meetingProvider)}`,
    opts.supervisorNombre ? `Supervisor: ${opts.supervisorNombre}` : undefined,
    opts.solicitante ? `Solicitada por: ${opts.solicitante}` : undefined,
    `© ${year} Lealtia`
  ].filter(Boolean)
  return { subject, html, text: textLines.join('\n') }
}

export function buildCitaCancelacionEmail(opts: {
  nombreAgente: string
  emailAgente: string
  inicio: string
  fin: string
  meetingUrl: string
  meetingProvider: string
  motivo?: string | null
  nombreProspecto?: string | null
  supervisorNombre?: string | null
  solicitante?: string | null
  timezone?: string | null
}) {
  const tz = opts.timezone || DEFAULT_TIMEZONE
  const { fecha, horaInicio, horaFin } = formatDateRange(opts.inicio, opts.fin, tz)
  const subject = `Cita cancelada — ${fecha} ${horaInicio}`
  const year = new Date().getFullYear()
  const LOGO_URL = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || 'https://via.placeholder.com/140x50?text=Lealtia'
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
    <div style="background-color:#7a0019;color:#fff;padding:16px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">Cita cancelada</h2>
    </div>
    <div style="padding:24px;background-color:#fff;">
      <p>Hola <strong>${opts.nombreAgente || opts.emailAgente}</strong>,</p>
      <p>La cita programada para el <strong>${fecha}</strong> de <strong>${horaInicio}</strong> a <strong>${horaFin}</strong> (${tz}) ha sido cancelada.</p>
      ${opts.motivo ? `<p><strong>Motivo:</strong> ${opts.motivo}</p>` : ''}
      ${opts.nombreProspecto ? `<p><strong>Prospecto:</strong> ${opts.nombreProspecto}</p>` : ''}
  <p><strong>Enlace (referencia):</strong> ${opts.meetingUrl ? `<a href="${opts.meetingUrl}" style="color:#004481">${opts.meetingUrl}</a>` : 'No disponible'}</p>
  <p><strong>Plataforma:</strong> ${humanizeProvider(opts.meetingProvider)}</p>
      ${opts.supervisorNombre ? `<p><strong>Supervisor:</strong> ${opts.supervisorNombre}</p>` : ''}
      ${opts.solicitante ? `<p>Gestionada por: ${opts.solicitante}</p>` : ''}
    </div>
    <div style="background-color:#f4f4f4;color:#555;font-size:12px;padding:16px;text-align:center;line-height:1.4">
      <p>© ${year} Lealtia — Todos los derechos reservados</p>
      <p>Este mensaje es confidencial y para uso exclusivo del destinatario.</p>
    </div>
  </div>`
  const textLines = [
    `Cita cancelada`,
    `Fecha: ${fecha}`,
    `Horario: ${horaInicio} - ${horaFin} (${tz})`,
    opts.motivo ? `Motivo: ${opts.motivo}` : undefined,
    opts.nombreProspecto ? `Prospecto: ${opts.nombreProspecto}` : undefined,
  opts.meetingUrl ? `Enlace: ${opts.meetingUrl}` : 'Enlace: No disponible',
  `Plataforma: ${humanizeProvider(opts.meetingProvider)}`,
    opts.supervisorNombre ? `Supervisor: ${opts.supervisorNombre}` : undefined,
    opts.solicitante ? `Gestionada por: ${opts.solicitante}` : undefined,
    `© ${year} Lealtia`
  ].filter(Boolean)
  return { subject, html, text: textLines.join('\n') }
}
// Carga perezosa de nodemailer para evitar que se incluya en el bundle cliente.

// Requiere variables de entorno:
// GMAIL_USER=lealtia.almacenamiento@gmail.com
// GMAIL_APP_PASS=contraseña de aplicación (NO la contraseña normal)
// Opcional: MAIL_FROM (Nombre <email>)

const user = process.env.GMAIL_USER
const pass = process.env.GMAIL_APP_PASS


import nodemailer from 'nodemailer'
// import type { Options as NodemailerSendMailOptions } from 'nodemailer/lib/mailer';
type MailTx = ReturnType<typeof nodemailer.createTransport>
let transporter: MailTx | null = null

function resolveLoginUrl() {
  // Prioridad: variable explícita > entorno production > preview dinámico > local
  if (process.env.MAIL_LOGIN_URL && process.env.MAIL_LOGIN_URL.trim().length > 0) {
    return process.env.MAIL_LOGIN_URL
  }
  const vercelEnv = process.env.VERCEL_ENV
  if (vercelEnv === 'production') {
    // Ajusta al dominio final productivo
    return 'https://lealtia-gestion-candidatos-79ck.vercel.app/login'
  }
  if (vercelEnv === 'preview' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/login`
  }
  // Desarrollo local
  return 'http://localhost:3000/login'
}

async function getTransporter(): Promise<MailTx> {
  if (!user || !pass) throw new Error('Mailer no configurado (GMAIL_USER / GMAIL_APP_PASS)')
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    })
    try {
      // verify no está incluida en nuestro type ligero; comprobamos existencia antes
      if (typeof (transporter as unknown as { verify?: () => Promise<unknown> }).verify === 'function') {
        await (transporter as unknown as { verify: () => Promise<unknown> }).verify()
      }
    } catch (e) {
      console.error('[mailer] Fallo verificación transporte:', e instanceof Error ? e.message : e)
      throw e
    }
  }
  return transporter
}

export interface SendMailOptions {
  to: string
  subject: string
  html?: string
  text?: string
  cc?: string | string[]
  bcc?: string | string[]
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>
}

export async function sendMail({ to, subject, html, text, cc, bcc, attachments }: SendMailOptions) {
  const tx = await getTransporter()
  const from = process.env.MAIL_FROM || user
  const opts = { from, to, cc, bcc, subject, text, html, attachments }
  await tx.sendMail(opts)
}

export function buildAltaUsuarioEmail(email: string, password: string) {
  const subject = 'Acceso temporal a la plataforma'
  const username = email.split('@')[0]
  const year = new Date().getFullYear()
  const LOGO_URL = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || 'https://via.placeholder.com/140x50?text=Lealtia'
  const LOGIN_URL = resolveLoginUrl()

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
    <div style="background-color:#004481;color:#fff;padding:16px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">Acceso Temporal</h2>
    </div>
    <div style="padding:24px;background-color:#fff;">
      <p>Hola <strong>${username}</strong>,</p>
      <p>Se ha generado una contraseña temporal para tu cuenta:</p>
      <p style="font-size:18px;background:#f4f4f4;padding:12px;border-radius:6px;text-align:center;font-weight:bold;letter-spacing:1px;">${password}</p>
      <p>Por seguridad, deberás cambiarla al ingresar por primera vez.</p>
      <div style="text-align:center;margin-top:20px;">
        <a href="${LOGIN_URL}" style="background-color:#004481;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px;display:inline-block">Iniciar sesión</a>
      </div>
    </div>
    <div style="background-color:#f4f4f4;color:#555;font-size:12px;padding:16px;text-align:center;line-height:1.4">
      <p>© ${year} Lealtia — Todos los derechos reservados</p>
      <p>Este mensaje es confidencial y para uso exclusivo del destinatario.</p>
    </div>
  </div>`

  const text = `Acceso temporal\nUsuario: ${email}\nPassword temporal: ${password}\nInicia sesión: ${LOGIN_URL}\n© ${year} Lealtia`
  return { subject, html, text }
}
