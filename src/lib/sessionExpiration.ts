import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'

const DEFAULT_COOKIE_NAME = 'gestion-session-issued'
const DEFAULT_MAX_AGE_MINUTES = 15

const rawName = process.env.AUTH_SESSION_COOKIE_NAME?.trim()
export const SESSION_COOKIE_NAME = rawName && rawName.length > 0 ? rawName : DEFAULT_COOKIE_NAME

function parseMinutes(value: string | undefined | null): number {
  if (!value) return DEFAULT_MAX_AGE_MINUTES
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_AGE_MINUTES
  }
  return parsed
}

export const SESSION_MAX_AGE_MINUTES = parseMinutes(process.env.AUTH_SESSION_MAX_AGE_MINUTES)
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_MINUTES * 60 * 1000
export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_MAX_AGE_MS / 1000)

export const SESSION_COOKIE_BASE: Omit<ResponseCookie, 'name' | 'value'> = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production'
}

export function parseSessionIssued(value: string | undefined | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}
