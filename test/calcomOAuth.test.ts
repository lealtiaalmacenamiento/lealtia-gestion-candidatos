import { afterEach, describe, expect, it } from 'vitest'
import { buildIntegrationConfig, toProviderKey } from '@/lib/integrations/oauth'

const originalEnv = {
  clientId: process.env.CALCOM_CLIENT_ID,
  clientSecret: process.env.CALCOM_CLIENT_SECRET,
  redirectUri: process.env.CALCOM_REDIRECT_URI
}

afterEach(() => {
  if (originalEnv.clientId == null) delete process.env.CALCOM_CLIENT_ID
  else process.env.CALCOM_CLIENT_ID = originalEnv.clientId
  if (originalEnv.clientSecret == null) delete process.env.CALCOM_CLIENT_SECRET
  else process.env.CALCOM_CLIENT_SECRET = originalEnv.clientSecret
  if (originalEnv.redirectUri == null) delete process.env.CALCOM_REDIRECT_URI
  else process.env.CALCOM_REDIRECT_URI = originalEnv.redirectUri
})

describe('Cal.com OAuth', () => {
  it('reconoce Cal.com como proveedor OAuth', () => {
    expect(toProviderKey('calcom')).toBe('calcom')
  })

  it('construye la configuración con permisos y callback registrados', () => {
    process.env.CALCOM_CLIENT_ID = 'client-id'
    process.env.CALCOM_CLIENT_SECRET = 'client-secret'
    process.env.CALCOM_REDIRECT_URI = 'https://crm.example.com/api/integraciones/calcom/callback'

    const config = buildIntegrationConfig({
      req: new Request('https://crm.example.com/api/integraciones/calcom/start'),
      provider: 'calcom'
    })

    expect(config?.authUrl).toBe('https://app.cal.com/auth/oauth2/authorize')
    expect(config?.tokenUrl).toBe('https://api.cal.com/v2/auth/oauth2/token')
    expect(config?.redirectUri).toBe(process.env.CALCOM_REDIRECT_URI)
    expect(config?.scopes).toEqual(expect.arrayContaining([
      'EVENT_TYPE_READ',
      'BOOKING_READ',
      'BOOKING_WRITE',
      'PROFILE_READ',
      'WEBHOOK_WRITE'
    ]))
  })

  it('se marca como no configurado si faltan credenciales', () => {
    delete process.env.CALCOM_CLIENT_ID
    delete process.env.CALCOM_CLIENT_SECRET
    expect(buildIntegrationConfig({
      req: new Request('http://localhost:3000/api/integraciones/calcom/start'),
      provider: 'calcom'
    })).toBeNull()
  })
})
