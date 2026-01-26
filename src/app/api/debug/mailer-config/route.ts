import { NextResponse } from 'next/server'

export async function GET() {
  const config = {
    MAILER_HOST: process.env.MAILER_HOST || 'NO_SET',
    MAILER_PORT: process.env.MAILER_PORT || 'NO_SET',
    MAILER_SECURE: process.env.MAILER_SECURE || 'NO_SET',
    MAILER_USER: process.env.MAILER_USER ? `${process.env.MAILER_USER.slice(0, 3)}***` : 'NO_SET',
    MAILER_PASS: process.env.MAILER_PASS ? '***SET***' : 'NO_SET',
    MAIL_FROM: process.env.MAIL_FROM || 'NO_SET',
    GMAIL_USER: process.env.GMAIL_USER ? `${process.env.GMAIL_USER.slice(0, 3)}***` : 'NO_SET',
    GMAIL_APP_PASS: process.env.GMAIL_APP_PASS ? '***SET***' : 'NO_SET',
    usingCustomSMTP: Boolean(process.env.MAILER_HOST)
  }

  return NextResponse.json(config)
}
