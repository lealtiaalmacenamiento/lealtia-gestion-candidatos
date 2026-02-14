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
    case 'teams':
      return 'Microsoft Teams'
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
  meetingId?: string | null
  meetingPassword?: string | null
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
      ${opts.meetingId ? `<p><strong>ID de sesión:</strong> ${opts.meetingId}</p>` : ''}
      ${opts.meetingPassword ? `<p><strong>Contraseña:</strong> ${opts.meetingPassword}</p>` : ''}
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
    opts.meetingId ? `ID de sesión: ${opts.meetingId}` : undefined,
    opts.meetingPassword ? `Contraseña: ${opts.meetingPassword}` : undefined,
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
  meetingId?: string | null
  meetingPassword?: string | null
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
      ${opts.meetingId ? `<p><strong>ID de sesión:</strong> ${opts.meetingId}</p>` : ''}
      ${opts.meetingPassword ? `<p><strong>Contraseña:</strong> ${opts.meetingPassword}</p>` : ''}
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
    opts.meetingId ? `ID de sesión: ${opts.meetingId}` : undefined,
    opts.meetingPassword ? `Contraseña: ${opts.meetingPassword}` : undefined,
    opts.supervisorNombre ? `Supervisor: ${opts.supervisorNombre}` : undefined,
    opts.solicitante ? `Gestionada por: ${opts.solicitante}` : undefined,
    `© ${year} Lealtia`
  ].filter(Boolean)
  return { subject, html, text: textLines.join('\n') }
}
// Carga perezosa de nodemailer para evitar que se incluya en el bundle cliente.

// Requiere variables de entorno:
// MAILER_HOST=smtpout.secureserver.net (GoDaddy/Titan)
// MAILER_USER=contacto@lealtia.com.mx
// MAILER_PASS=contraseña SMTP
// Opcional: MAILER_PORT=465 (default)
// Opcional: MAILER_SECURE=true|false (default: true)
// Opcional: MAIL_FROM (Nombre <email>)

const user = process.env.MAILER_USER
const pass = process.env.MAILER_PASS
const host = process.env.MAILER_HOST
const port = process.env.MAILER_PORT ? Number(process.env.MAILER_PORT) : 465
const secure = typeof process.env.MAILER_SECURE === 'string'
  ? ['1', 'true', 'yes', 'on'].includes(process.env.MAILER_SECURE.toLowerCase())
  : true


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
  if (!user || !pass) throw new Error('Mailer no configurado (MAILER_USER / MAILER_PASS)')
  if (!host) throw new Error('Mailer no configurado (MAILER_HOST requerido)')
  
  if (!transporter) {
    const options = {
      host,
      port,
      secure,
      auth: { user, pass }
    }

    transporter = nodemailer.createTransport(options as Parameters<typeof nodemailer.createTransport>[0])
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
  try {
    await tx.sendMail(opts)
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('[mailer] sendMail failed:', errMsg)
    throw new Error(`Mailer error: ${errMsg}`)
  }
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

export function buildProspectoPPREmail(opts: {
  nombreProspecto: string
  edad: number
  email: string
  telefono: string
  plan: string
  primaMensualMXN: string
  meta65MXN: string
  añosPago: number
  nombreAgente: string
}) {
  const subject = `Nuevo prospecto PPR desde landing - ${opts.nombreProspecto}`
  const year = new Date().getFullYear()
  const LOGO_URL = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || 'https://via.placeholder.com/140x50?text=Lealtia'
  const LOGIN_URL = resolveLoginUrl()
  
  const planNombre = opts.plan === '65' ? 'Imagina ser 65' : opts.plan === '15' ? 'Imagina ser 15' : 'Imagina ser 10'

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
    <div style="background-color:#004481;color:#fff;padding:16px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">Nuevo Prospecto PPR</h2>
    </div>
    <div style="padding:24px;background-color:#fff;">
      <p>Hola <strong>${opts.nombreAgente}</strong>,</p>
      <p>Se ha registrado un nuevo prospecto desde el simulador de Plan de Retiro:</p>
      
      <div style="background-color:#f8f9fa;padding:16px;border-radius:6px;margin:16px 0;">
        <h3 style="margin:0 0 12px 0;color:#004481;font-size:16px;">Datos del prospecto</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;"><strong>Nombre:</strong></td><td style="padding:6px 0;">${opts.nombreProspecto}</td></tr>
          <tr><td style="padding:6px 0;"><strong>Edad:</strong></td><td style="padding:6px 0;">${opts.edad} años</td></tr>
          <tr><td style="padding:6px 0;"><strong>Email:</strong></td><td style="padding:6px 0;">${opts.email}</td></tr>
          <tr><td style="padding:6px 0;"><strong>Teléfono:</strong></td><td style="padding:6px 0;">${opts.telefono}</td></tr>
        </table>
      </div>

      <div style="background-color:#e8f4f8;padding:16px;border-radius:6px;margin:16px 0;">
        <h3 style="margin:0 0 12px 0;color:#004481;font-size:16px;">Plan seleccionado</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;"><strong>Plan:</strong></td><td style="padding:6px 0;">${planNombre}</td></tr>
          <tr><td style="padding:6px 0;"><strong>Aportación mensual:</strong></td><td style="padding:6px 0;">${opts.primaMensualMXN}</td></tr>
          <tr><td style="padding:6px 0;"><strong>Meta a los 65:</strong></td><td style="padding:6px 0;">${opts.meta65MXN}</td></tr>
          <tr><td style="padding:6px 0;"><strong>Años de pago:</strong></td><td style="padding:6px 0;">${opts.añosPago} años</td></tr>
        </table>
      </div>

      <p style="margin-top:20px;"><strong>Estado:</strong> Pendiente</p>
      <p><strong>Origen:</strong> Landing page - simulador PPR</p>

      <div style="text-align:center;margin-top:24px;">
        <a href="${LOGIN_URL}" style="background-color:#004481;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block">Ver en el sistema</a>
      </div>
    </div>
    <div style="background-color:#f4f4f4;color:#555;font-size:12px;padding:16px;text-align:center;line-height:1.4">
      <p>© ${year} Lealtia — Todos los derechos reservados</p>
      <p>Este mensaje es confidencial y para uso exclusivo del destinatario.</p>
    </div>
  </div>`

  const text = `Nuevo prospecto de Plan de Retiro

Nombre: ${opts.nombreProspecto}
Edad: ${opts.edad} años
Email: ${opts.email}
Teléfono: ${opts.telefono}

Plan seleccionado: ${planNombre}
Aportación mensual: ${opts.primaMensualMXN}
Meta a los 65: ${opts.meta65MXN}
Años de pago: ${opts.añosPago}

Estado: Pendiente
Origen: Landing page - simulador PPR

Accede al sistema: ${LOGIN_URL}

© ${year} Lealtia`

  return { subject, html, text }
}

export function buildRecruitmentEmail(opts: {
  nombre: string
  ciudad: string
  edad: string
  telefono: string
  email: string
  interes: string
}) {
  const subject = `Nueva solicitud de reclutamiento - ${opts.nombre}`
  const year = new Date().getFullYear()
  const LOGO_URL = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || 'https://via.placeholder.com/140x50?text=Lealtia'
  const LOGIN_URL = resolveLoginUrl()
  
  const interesLabel = opts.interes === 'cotizar' ? 'Cotizar un seguro' : 
                       opts.interes === 'agente' ? 'Ser agente' : 
                       opts.interes === 'ambos' ? 'Ambos (cotizar y ser agente)' : opts.interes

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
    <div style="background-color:#004481;color:#fff;padding:16px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">Nueva Solicitud - Únete a Lealtia</h2>
    </div>
    <div style="padding:24px;background-color:#fff;">
      <p>Se ha registrado una nueva solicitud desde el formulario "Únete a Lealtia" en la landing page:</p>
      
      <div style="background-color:#f8f9fa;padding:16px;border-radius:6px;margin:16px 0;">
        <h3 style="margin:0 0 12px 0;color:#004481;font-size:16px;">Datos del contacto</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;"><strong>Nombre:</strong></td><td style="padding:6px 0;">${opts.nombre}</td></tr>
          <tr><td style="padding:6px 0;"><strong>Ciudad:</strong></td><td style="padding:6px 0;">${opts.ciudad}</td></tr>
          <tr><td style="padding:6px 0;"><strong>Edad:</strong></td><td style="padding:6px 0;">${opts.edad} años</td></tr>
          <tr><td style="padding:6px 0;"><strong>Teléfono:</strong></td><td style="padding:6px 0;">${opts.telefono}</td></tr>
          <tr><td style="padding:6px 0;"><strong>Email:</strong></td><td style="padding:6px 0;">${opts.email}</td></tr>
          <tr><td style="padding:6px 0;"><strong>Me interesa:</strong></td><td style="padding:6px 0;">${interesLabel}</td></tr>
        </table>
      </div>

      <p style="margin-top:20px;"><strong>Origen:</strong> Landing page - Formulario de reclutamiento</p>

      <div style="text-align:center;margin-top:24px;">
        <a href="${LOGIN_URL}" style="background-color:#004481;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block">Acceder al sistema</a>
      </div>
    </div>
    <div style="background-color:#f4f4f4;color:#555;font-size:12px;padding:16px;text-align:center;line-height:1.4">
      <p>© ${year} Lealtia — Todos los derechos reservados</p>
      <p>Este mensaje es confidencial y para uso exclusivo del destinatario.</p>
    </div>
  </div>`

  const text = `Nueva solicitud de reclutamiento

Nombre: ${opts.nombre}
Ciudad: ${opts.ciudad}
Edad: ${opts.edad} años
Teléfono: ${opts.telefono}
Email: ${opts.email}
Me interesa: ${interesLabel}

Origen: Landing page - Formulario de reclutamiento

Accede al sistema: ${LOGIN_URL}

© ${year} Lealtia`

  return { subject, html, text }
}
