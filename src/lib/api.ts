import { Auditoria, Candidato, CedulaA1, Efc, Usuario, ProductoParametro, AgendaDeveloper, AgendaSlotsResponse, AgendaCita } from '@/types'

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud')
  return data as T
}

/* ========= CANDIDATOS ========= */
export async function getCandidatos(): Promise<Candidato[]> {
  const res = await fetch('/api/candidatos')
  return handleResponse<Candidato[]>(res)
}

export async function getCandidatoById(id: number): Promise<Candidato> {
  const res = await fetch(`/api/candidatos/${id}`)
  return handleResponse<Candidato>(res)
}

export async function getCandidatoByCT(ct: string): Promise<Candidato | null> {
  const res = await fetch(`/api/candidatos?ct=${encodeURIComponent(ct)}`, { cache: 'no-store' })
  // La API devuelve null si no existe
  if (res.status === 200) {
    const data = await res.json()
    return data as (Candidato | null)
  }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error consultando CT')
  return null
}

export async function getCandidatoByEmail(email: string): Promise<Candidato | null> {
  const q = `/api/candidatos?email_agente=${encodeURIComponent(email.trim().toLowerCase())}`
  const res = await fetch(q, { cache: 'no-store' })
  if (res.status === 200) {
    const data = await res.json()
    return data as (Candidato | null)
  }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error consultando email')
  return null
}

export async function createCandidato(payload: Partial<Candidato>): Promise<Candidato> {
  const res = await fetch('/api/candidatos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return handleResponse<Candidato>(res)
}

export async function updateCandidato(id: number, payload: Partial<Candidato>): Promise<Candidato> {
  const res = await fetch(`/api/candidatos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return handleResponse<Candidato>(res)
}

export async function deleteCandidato(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`/api/candidatos/${id}`, { method: 'DELETE' })
  return handleResponse<{ success: boolean }>(res)
}

/* ========= CLIENTES ========= */
export async function deleteCliente(id: string): Promise<{ success: boolean; polizasAnuladas?: number; alreadyInactive?: boolean }> {
  const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' })
  return handleResponse<{ success: boolean; polizasAnuladas?: number; alreadyInactive?: boolean }>(res)
}

/* ========= USUARIOS ========= */
export async function getUsuarios(): Promise<Usuario[]> {
  const res = await fetch('/api/usuarios')
  return handleResponse<Usuario[]>(res)
}

export async function getUsuarioById(id: number): Promise<Usuario> {
  const res = await fetch(`/api/usuarios/${id}`)
  return handleResponse<Usuario>(res)
}

export interface CreateUsuarioResult { success: boolean; user: Usuario; passwordTemporal?: string; correoEnviado?: boolean; correoError?: string }
export async function createUsuario(payload: Record<string, unknown>): Promise<CreateUsuarioResult> {
  const res = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return handleResponse<CreateUsuarioResult>(res)
}

export async function updateUsuario(id: number, payload: Partial<Usuario>): Promise<Usuario> {
  const res = await fetch(`/api/usuarios/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return handleResponse<Usuario>(res)
}

export interface DeleteUsuarioOptions { transferTo?: number }
export async function deleteUsuario(id: number, options?: DeleteUsuarioOptions): Promise<{ success: boolean; stats?: Record<string, number>; warning?: string }> {
  const fetchOptions: RequestInit = { method: 'DELETE' }
  if (options?.transferTo) {
    fetchOptions.headers = { 'Content-Type': 'application/json' }
    fetchOptions.body = JSON.stringify({ transferTo: options.transferTo })
  }
  const res = await fetch(`/api/usuarios/${id}`, fetchOptions)
  return handleResponse<{ success: boolean; stats?: Record<string, number>; warning?: string }>(res)
}

export async function resetPasswordUsuario(email: string): Promise<{ success: boolean }> {
  const res = await fetch('/api/usuarios/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  })
  return handleResponse<{ success: boolean }>(res)
}

export async function changePassword(newPassword: string): Promise<{ success: boolean }> {
  const res = await fetch('/api/usuarios/change_password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control':'no-store' },
    credentials: 'include',
    body: JSON.stringify({ newPassword })
  })
  return handleResponse<{ success: boolean }>(res)
}

/* ========= CEDULA A1 ========= */
export async function getCedulaA1(): Promise<CedulaA1[]> {
  const res = await fetch(`/api/cedula_a1?ts=${Date.now()}`, { cache: 'no-store' })
  return handleResponse<CedulaA1[]>(res)
}

export async function createCedulaA1(payload: Partial<CedulaA1>): Promise<CedulaA1> {
  const res = await fetch('/api/cedula_a1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return handleResponse<CedulaA1>(res)
}

export async function updateCedulaA1(id: number, payload: Partial<CedulaA1>): Promise<CedulaA1> {
  const allowed: (keyof CedulaA1)[] = ['mes','periodo_para_registro_y_envio_de_documentos','capacitacion_cedula_a1']
  const clean: Record<string, unknown> = {}
  for (const k of allowed) if (payload[k] !== undefined) clean[k] = payload[k]
  const res = await fetch(`/api/cedula_a1/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clean)
  })
  return handleResponse<CedulaA1>(res)
}

export async function deleteCedulaA1(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`/api/cedula_a1/${id}`, { method: 'DELETE' })
  return handleResponse<{ success: boolean }>(res)
}

/* ========= EFC ========= */
export async function getEfc(): Promise<Efc[]> {
  const res = await fetch(`/api/efc?ts=${Date.now()}`, { cache: 'no-store' })
  return handleResponse<Efc[]>(res)
}

export async function createEfc(payload: Partial<Efc>): Promise<Efc> {
  const res = await fetch('/api/efc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return handleResponse<Efc>(res)
}

export async function updateEfc(id: number, payload: Partial<Efc>): Promise<Efc> {
  const allowed: (keyof Efc)[] = ['efc','periodo_para_ingresar_folio_oficina_virtual','periodo_para_playbook','pre_escuela_sesion_unica_de_arranque','fecha_limite_para_presentar_curricula_cdp','inicio_escuela_fundamental']
  const clean: Record<string, unknown> = {}
  for (const k of allowed) if (payload[k] !== undefined) clean[k] = payload[k]
  const res = await fetch(`/api/efc/${id}` , {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clean)
  })
  return handleResponse<Efc>(res)
}

export async function deleteEfc(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`/api/efc/${id}`, { method: 'DELETE' })
  return handleResponse<{ success: boolean }>(res)
}

/* ========= AUDITORÍA ========= */
export async function getAuditoria(): Promise<Auditoria[]> {
  const res = await fetch('/api/auditoria')
  const raw = await res.json()
  if(!res.ok) throw new Error(raw.message || raw.error || 'Error auditoría')
  if(Array.isArray(raw)) return raw as Auditoria[] // compat previo
  if(raw && raw.success && Array.isArray(raw.data)) return raw.data as Auditoria[]
  return []
}
export async function deleteAuditoria(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`/api/auditoria/${id}`, { method: 'DELETE' })
  return handleResponse<{ success: boolean }>(res)
}

/* ========= PRODUCTO PARAMETROS (Fase 3) ========= */
export async function getProductoParametros(options?: { includeInactivos?: boolean }): Promise<ProductoParametro[]> {
  const params = new URLSearchParams({ debug: '1' })
  if (options?.includeInactivos) params.set('include_inactivos', '1')
  const res = await fetch(`/api/producto_parametros?${params.toString()}`, { cache: 'no-store' })
  return handleResponse<ProductoParametro[]>(res)
}

export async function createProductoParametro(payload: Partial<ProductoParametro>): Promise<ProductoParametro> {
  const res = await fetch('/api/producto_parametros?debug=1', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  })
  return handleResponse<ProductoParametro>(res)
}

export async function updateProductoParametro(id: string, payload: Partial<ProductoParametro>): Promise<ProductoParametro> {
  const res = await fetch(`/api/producto_parametros/${id}?debug=1`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  })
  return handleResponse<ProductoParametro>(res)
}

export async function deleteProductoParametro(id: string): Promise<{ success: boolean; data?: ProductoParametro }> {
  const res = await fetch(`/api/producto_parametros/${id}?debug=1`, { method: 'DELETE' })
  return handleResponse<{ success: boolean; data?: ProductoParametro }>(res)
}

/* ========= AGENDA (Fase 4) ========= */

export async function getAgendaDevelopers(options?: { soloDesarrolladores?: boolean; soloActivos?: boolean }): Promise<AgendaDeveloper[]> {
  const params = new URLSearchParams()
  if (options?.soloDesarrolladores) params.set('solo_desarrolladores', '1')
  if (options?.soloActivos) params.set('solo_activos', '1')
  const qs = params.toString()
  const url = qs ? `/api/agenda/desarrolladores?${qs}` : '/api/agenda/desarrolladores'
  const res = await fetch(url, { cache: 'no-store' })
  const data = await handleResponse<{ usuarios: AgendaDeveloper[] }>(res)
  return data.usuarios
}

export async function updateAgendaDevelopers(payload: { usuarioId: number; isDesarrollador: boolean } | Array<{ usuarioId: number; isDesarrollador: boolean }>): Promise<AgendaDeveloper[]> {
  const body = Array.isArray(payload) ? payload : [payload]
  const res = await fetch('/api/agenda/desarrolladores', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await handleResponse<{ usuarios: AgendaDeveloper[] }>(res)
  return data.usuarios
}

export async function getAgendaSlots(usuarioIds: number[], range?: { desde?: string; hasta?: string }): Promise<AgendaSlotsResponse> {
  if (!usuarioIds.length) return { range: { desde: range?.desde || null, hasta: range?.hasta || null }, busy: [], missingAuth: [] }
  const params = new URLSearchParams({ usuarios: usuarioIds.join(',') })
  if (range?.desde) params.set('desde', range.desde)
  if (range?.hasta) params.set('hasta', range.hasta)
  const res = await fetch(`/api/agenda/slots?${params.toString()}`, { cache: 'no-store' })
  return handleResponse<AgendaSlotsResponse>(res)
}

export interface CreateAgendaCitaPayload {
  prospectoId?: number | null
  agenteId: number
  supervisorId?: number | null
  inicio: string
  fin: string
  meetingProvider: string
  meetingUrl?: string | null
  externalEventId?: string | null
  prospectoNombre?: string | null
  notas?: string | null
  generarEnlace?: boolean
}

export async function createAgendaCita(payload: CreateAgendaCitaPayload & Record<string, unknown>): Promise<AgendaCita> {
  const res = await fetch('/api/agenda/citas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await handleResponse<{ cita: AgendaCita }>(res)
  return data.cita
}

export async function cancelAgendaCita(citaId: number, motivo?: string): Promise<{ success: boolean }> {
  const res = await fetch('/api/agenda/citas/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ citaId, motivo })
  })
  return handleResponse<{ success: boolean }>(res)
}

export async function getAgendaCitas(options?: { estado?: 'confirmada' | 'cancelada'; desde?: string; hasta?: string; limit?: number; agenteId?: number }): Promise<AgendaCita[]> {
  const params = new URLSearchParams()
  if (options?.estado) params.set('estado', options.estado)
  if (options?.desde) params.set('desde', options.desde)
  if (options?.hasta) params.set('hasta', options.hasta)
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.agenteId) params.set('agente_id', String(options.agenteId))
  const qs = params.toString()
  const res = await fetch(qs ? `/api/agenda/citas?${qs}` : '/api/agenda/citas', { cache: 'no-store' })
  const data = await handleResponse<{ citas: AgendaCita[] }>(res)
  return data.citas
}
