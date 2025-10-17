import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { getIntegrationToken, removeIntegrationToken } from '@/lib/integrationTokens'
import type { IntegrationProviderKey } from '@/types'

const PROVIDERS: IntegrationProviderKey[] = ['google', 'microsoft', 'zoom']

export async function GET() {
  const actor = await getUsuarioSesion()
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!actor.id_auth) {
    return NextResponse.json({ error: 'Usuario sin id_auth configurado' }, { status: 400 })
  }

  const statuses = [] as Array<{ provider: IntegrationProviderKey; connected: boolean; expiresAt: string | null; scopes: string[] | null }>
  for (const provider of PROVIDERS) {
    const { token, error } = await getIntegrationToken(actor.id_auth, provider)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    statuses.push({
      provider,
      connected: Boolean(token?.accessToken),
      expiresAt: token?.expiresAt ?? null,
      scopes: token?.scopes ?? null
    })
  }

  return NextResponse.json({ providers: statuses })
}

export async function DELETE(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!actor.id_auth) {
    return NextResponse.json({ error: 'Usuario sin id_auth configurado' }, { status: 400 })
  }

  const url = new URL(req.url)
  const providerParam = (url.searchParams.get('provider') || '').toLowerCase()
  if (!PROVIDERS.includes(providerParam as IntegrationProviderKey)) {
    return NextResponse.json({ error: 'Proveedor inválido' }, { status: 400 })
  }

  const { error } = await removeIntegrationToken(actor.id_auth, providerParam as IntegrationProviderKey)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    await logAccion('integracion_desconectada', {
      usuario: actor.email,
      tabla_afectada: 'tokens_integracion',
      snapshot: { provider: providerParam }
    })
  } catch {}

  return NextResponse.json({ ok: true })
}
