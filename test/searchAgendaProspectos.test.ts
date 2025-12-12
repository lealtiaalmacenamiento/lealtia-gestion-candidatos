import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { searchAgendaProspectos } from '@/lib/api'

describe('searchAgendaProspectos', () => {
  const originalFetch = global.fetch
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
  const globalWithFetch = globalThis as typeof globalThis & { fetch: typeof fetch }

  beforeEach(() => {
    fetchMock.mockReset()
    globalWithFetch.fetch = fetchMock
  })

  afterEach(() => {
    globalWithFetch.fetch = originalFetch
    vi.resetAllMocks()
  })

  it('builds query params and returns prospectos array', async () => {
    const mockResp = { prospectos: [{ id: 1, nombre: 'Juan', email: 'a@b.com' }] }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockResp), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const results = await searchAgendaProspectos({ agenteId: 123, query: 'juan', limit: 10, includeConCita: true, includeSinCorreo: true })

    expect(results).toHaveLength(1)
    // verify fetch was called with expected query string
    const callArg = fetchMock.mock.calls[0][0] as string
    expect(callArg).toContain('/api/agenda/prospectos')
    expect(callArg).toContain('agente_id=123')
    expect(callArg).toContain('q=juan')
    expect(callArg).toContain('limit=10')
    expect(callArg).toContain('include_con_cita=1')
    expect(callArg).toContain('include_sin_correo=1')
  })
})
