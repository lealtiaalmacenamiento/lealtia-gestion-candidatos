// Carga perezosa de nodemailer para evitar que se incluya en el bundle cliente.

// Requiere variables de entorno:
// GMAIL_USER=lealtia.almacenamiento@gmail.com
// GMAIL_APP_PASS=contraseña de aplicación (NO la contraseña normal)
// Opcional: MAIL_FROM (Nombre <email>)

const user = process.env.GMAIL_USER
const pass = process.env.GMAIL_APP_PASS

import nodemailer from 'nodemailer'
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
}

export async function sendMail({ to, subject, html, text }: SendMailOptions) {
  const tx = await getTransporter()
  const from = process.env.MAIL_FROM || user
  await tx.sendMail({ from, to, subject, text, html })
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
