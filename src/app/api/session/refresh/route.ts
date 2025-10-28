import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { SESSION_COOKIE_BASE, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/sessionExpiration'

export const dynamic = 'force-dynamic'

function buildResponse(status: number, body: Record<string, unknown>) {
  const response = NextResponse.json(body, { status })
  response.cookies.set(SESSION_COOKIE_NAME, status === 200 ? String(Date.now()) : '', {
    ...SESSION_COOKIE_BASE,
    ...(status === 200
      ? { maxAge: SESSION_MAX_AGE_SECONDS }
      : { expires: new Date(0) })
  })
  return response
}

export async function POST() {
  const user = await getUsuarioSesion()
  if (!user) {
    return buildResponse(401, { error: 'No autenticado' })
  }
  return buildResponse(200, { ok: true })
}

export async function GET() {
  return POST()
}
