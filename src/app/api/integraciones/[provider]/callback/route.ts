import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { buildIntegrationConfig, handleIntegrationCallback, toProviderKey, validateState } from '@/lib/integrations/oauth'

function buildRedirect(base: string, provider: string, status: 'success' | 'error', message?: string | null) {
  const url = new URL(base)
  url.searchParams.set('provider', provider)
  url.searchParams.set('status', status)
  if (message) url.searchParams.set('message', message)
  return url.toString()
}

export async function GET(req: Request, context: { params: Promise<{ provider: string }> }) {
  const params = await context.params
  const provider = toProviderKey(params.provider.toLowerCase())
  if (!provider) {
    return NextResponse.json({ error: 'Proveedor no soportado' }, { status: 404 })
  }

  const config = buildIntegrationConfig({ req, provider })
  if (!config) {
    return NextResponse.json({ error: 'Proveedor no configurado' }, { status: 500 })
  }

  const url = new URL(req.url)
  const errorParam = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  if (errorParam) {
    const redirect = buildRedirect(config.finishRedirect, provider, 'error', errorDescription || errorParam)
    return NextResponse.redirect(redirect)
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code) {
    const redirect = buildRedirect(config.finishRedirect, provider, 'error', 'Código de autorización ausente')
    return NextResponse.redirect(redirect)
  }

  try {
    await validateState(provider, state)
  } catch (err) {
    const redirect = buildRedirect(config.finishRedirect, provider, 'error', err instanceof Error ? err.message : 'State inválido')
    return NextResponse.redirect(redirect)
  }

  const actor = await getUsuarioSesion()
  if (!actor) {
    const redirect = buildRedirect(config.finishRedirect, provider, 'error', 'Sesión expirada')
    return NextResponse.redirect(redirect)
  }
  if (!actor.id_auth) {
    const redirect = buildRedirect(config.finishRedirect, provider, 'error', 'Usuario sin id_auth configurado')
    return NextResponse.redirect(redirect)
  }

  try {
    await handleIntegrationCallback({ req, provider }, code, actor.id_auth)
    try {
      await logAccion('integracion_conectada', {
        usuario: actor.email,
        tabla_afectada: 'tokens_integracion',
        snapshot: { provider }
      })
    } catch {}
    const redirect = buildRedirect(config.finishRedirect, provider, 'success')
    return NextResponse.redirect(redirect)
  } catch (err) {
    const redirect = buildRedirect(config.finishRedirect, provider, 'error', err instanceof Error ? err.message : 'Error guardando token')
    return NextResponse.redirect(redirect)
  }
}
