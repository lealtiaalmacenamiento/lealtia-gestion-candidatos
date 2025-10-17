import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { buildAuthorizationRedirect, toProviderKey } from '@/lib/integrations/oauth'

export async function GET(req: Request, context: { params: Promise<{ provider: string }> }) {
  const params = await context.params
  const actor = await getUsuarioSesion()
  if (!actor) {
    const url = new URL(req.url)
    url.pathname = '/login'
    return NextResponse.redirect(url.toString())
  }
  if (!actor.id_auth) {
    return NextResponse.json({ error: 'Usuario sin id_auth configurado' }, { status: 400 })
  }

  const provider = toProviderKey(params.provider.toLowerCase())
  if (!provider) {
    return NextResponse.json({ error: 'Proveedor no soportado' }, { status: 404 })
  }

  return buildAuthorizationRedirect({ req, provider })
}
