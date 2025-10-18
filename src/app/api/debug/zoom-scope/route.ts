import { buildIntegrationConfig } from '@/lib/integrations/oauth'

export async function GET(req: Request) {
  const config = buildIntegrationConfig({ req, provider: 'zoom' })
  return Response.json({
    scopes: config?.scopes ?? null,
    redirectUri: config?.redirectUri ?? null,
    authUrl: config?.authUrl ?? null,
    requestedScopeString: config?.scopes.join(' ') ?? null
  })
}
