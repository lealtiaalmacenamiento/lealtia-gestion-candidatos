import { Auditoria, Candidato, CedulaA1, Efc, Usuario } from '@/types'

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

export async function deleteUsuario(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' })
  return handleResponse<{ success: boolean }>(res)
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
