import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getIntegrationToken, upsertIntegrationToken } from '@/lib/integrationTokens'

type Provider = 'google'

type IntegrationConfig = {
  provider: Provider
  clientId: string
  clientSecret: string
  authUrl: string
  tokenUrl: string
  scopes: string[]
  extraAuthParams?: Record<string, string>
}

type TokenResponse = {
  accessToken: string
  refreshToken?: string | null
  expiresIn: number | null
  scope?: string | null
}

type RequestContext = {
  req: Request
  provider: Provider
}

type BuildResult = IntegrationConfig & {
  redirectUri: string
  finishRedirect: string
}

const PROVIDERS: Record<Provider, (origin: string) => IntegrationConfig | null> = {
  google: () => {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) return null
    return {
      provider: 'google',
      clientId,
      clientSecret,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      // Need read/write events for meeting creation plus read-only busy lookup
      scopes: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly'
      ],
      extraAuthParams: {
        access_type: 'offline',
        prompt: 'consent'
      }
    }
  }
}

function getOrigin(req: Request): string {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

export function buildIntegrationConfig({ req, provider }: RequestContext): BuildResult | null {
  const origin = getOrigin(req)
  const builder = PROVIDERS[provider]
  if (!builder) return null
  const base = builder(origin)
  if (!base) return null
  const redirectUri = `${origin}/api/integraciones/${provider}/callback`
  const finishRedirect = `${origin}/integraciones`
  return {
    ...base,
    redirectUri,
    finishRedirect
  }
}

export async function buildAuthorizationRedirect(ctx: RequestContext) {
  const config = buildIntegrationConfig(ctx)
  if (!config) return NextResponse.json({ error: 'Proveedor no configurado' }, { status: 500 })
  const cookieStore = await cookies()
  const state = randomBytes(16).toString('hex')
  cookieStore.set(`integration_state_${ctx.provider}`, state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60
  })

  const url = new URL(config.authUrl)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  url.searchParams.set('scope', config.scopes.join(' '))
  if (config.provider === 'google') {
    url.searchParams.set('include_granted_scopes', 'true')
  }
  if (config.extraAuthParams) {
    for (const [key, value] of Object.entries(config.extraAuthParams)) {
      url.searchParams.set(key, value)
    }
  }

  return NextResponse.redirect(url.toString())
}

async function exchangeCodeForTokens(config: BuildResult, code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code'
  })

  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString()
  })

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    const message = (payload && typeof payload.error === 'string') ? payload.error : 'Error intercambiando código'
    throw new Error(message)
  }

  const accessToken = typeof payload?.access_token === 'string' ? payload.access_token : ''
  const refreshToken = typeof payload?.refresh_token === 'string' ? payload.refresh_token : null
  const expiresIn = typeof payload?.expires_in === 'number' ? payload.expires_in : Number(payload?.expires_in ?? 0)
  const scope = typeof payload?.scope === 'string' ? payload.scope : null

  return {
    accessToken,
    refreshToken,
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : null,
    scope
  }
}

export async function handleIntegrationCallback(ctx: RequestContext, code: string, usuarioAuthId: string) {
  const config = buildIntegrationConfig(ctx)
  if (!config) throw new Error('Proveedor no configurado')
  const tokens = await exchangeCodeForTokens(config, code)
  if (!tokens.accessToken) throw new Error('No se recibió access_token')

  const existing = await getIntegrationToken(usuarioAuthId, ctx.provider)
  const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString() : existing.token?.expiresAt ?? null
  const scopes = tokens.scope ? tokens.scope.split(/[\s,]+/).filter(Boolean) : existing.token?.scopes ?? null
  const refreshToken = tokens.refreshToken ?? existing.token?.refreshToken ?? null

  await upsertIntegrationToken(usuarioAuthId, ctx.provider, {
    accessToken: tokens.accessToken,
    refreshToken,
    expiresAt,
    scopes
  })
}

export async function validateState(provider: Provider, incoming: string | null) {
  const cookieStore = await cookies()
  const expected = cookieStore.get(`integration_state_${provider}`)?.value || null
  cookieStore.delete({ name: `integration_state_${provider}`, path: '/' })
  if (!incoming || !expected || incoming !== expected) {
    throw new Error('State inválido o expirado')
  }
}

export function toProviderKey(value: string): Provider | null {
  if (value === 'google') return value
  return null
}


