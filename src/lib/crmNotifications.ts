import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMail } from '@/lib/mailer'

export interface CrmNotificationRecipient {
  id_auth?: string | null
  email?: string | null
  nombre?: string | null
}

export interface CrmNotificationInput {
  titulo: string
  mensaje: string
  metadata?: Record<string, unknown>
  dedupeKey?: string | null
  email?: {
    subject: string
    heading: string
    lines: string[]
    actionUrl?: string | null
    actionLabel?: string | null
  }
}

function crmUrl(path = '/home') {
  const base =
    process.env.MAIL_LOGIN_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000'
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

function buildNotificationEmail(opts: {
  heading: string
  lines: string[]
  actionUrl?: string | null
  actionLabel?: string | null
}) {
  const year = new Date().getFullYear()
  const LOGO_URL = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || 'https://via.placeholder.com/140x50?text=Lealtia'
  const actionUrl = opts.actionUrl || crmUrl('/home')
  const actionLabel = opts.actionLabel || 'Abrir CRM'
  const body = opts.lines
    .filter(Boolean)
    .map(line => `<p style="margin:0 0 12px;color:#263238;line-height:1.55">${line}</p>`)
    .join('')
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #ddd;border-radius:10px;overflow:hidden">
    <div style="background:#004481;color:#fff;padding:18px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">${opts.heading}</h2>
    </div>
    <div style="padding:24px;background:#fff">
      ${body}
      <p style="text-align:center;margin:24px 0 0">
        <a href="${actionUrl}" style="background:#004481;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">${actionLabel}</a>
      </p>
    </div>
    <div style="background:#f4f4f4;color:#555;font-size:12px;padding:14px;text-align:center;line-height:1.4">
      <p style="margin:0">© ${year} Lealtia — Todos los derechos reservados</p>
    </div>
  </div>`
  const text = `${opts.heading}\n\n${opts.lines.filter(Boolean).join('\n')}\n\n${actionLabel}: ${actionUrl}\n\n© ${year} Lealtia`
  return { html, text }
}

function uniqueRecipients(recipients: CrmNotificationRecipient[]) {
  const seen = new Set<string>()
  const out: CrmNotificationRecipient[] = []
  for (const recipient of recipients) {
    const key = recipient.id_auth || recipient.email
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(recipient)
  }
  return out
}

export async function notifyCrmUsers(
  supabase: SupabaseClient,
  recipients: CrmNotificationRecipient[],
  input: CrmNotificationInput
) {
  const metadata = {
    ...(input.metadata || {}),
    ...(input.dedupeKey ? { dedupe_key: input.dedupeKey } : {})
  }

  for (const recipient of uniqueRecipients(recipients)) {
    if (recipient.id_auth) {
      try {
        if (input.dedupeKey) {
          const { data: existing } = await supabase
            .from('notificaciones')
            .select('id')
            .eq('usuario_id', recipient.id_auth)
            .contains('metadata', { dedupe_key: input.dedupeKey })
            .limit(1)
          if (existing?.length) continue
        }
        await supabase.from('notificaciones').insert({
          usuario_id: recipient.id_auth,
          tipo: 'sistema',
          titulo: input.titulo,
          mensaje: input.mensaje,
          metadata
        })
      } catch (error) {
        console.error('[crmNotifications] error creando notificación', error)
      }
    }

    if (input.email && recipient.email?.includes('@')) {
      try {
        const content = buildNotificationEmail(input.email)
        await sendMail({
          to: recipient.email,
          subject: input.email.subject,
          html: content.html,
          text: content.text
        })
      } catch (error) {
        console.error('[crmNotifications] error enviando correo', error)
      }
    }
  }
}

