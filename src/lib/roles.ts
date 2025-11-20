export type AppRole = 'admin' | 'supervisor' | 'viewer' | 'agente'

export function normalizeRole(rol?: string | null): AppRole | null {
  if (!rol) return null
  const r = String(rol).trim().toLowerCase()
  if (r === 'super usuario' || r === 'superusuario' || r === 'super_usuario') return 'supervisor'
  if (r === 'editor') return 'supervisor'
  if (r === 'lector') return 'viewer'
  if (r === 'admin' || r === 'supervisor' || r === 'viewer' || r === 'agente') return r as AppRole
  return null
}

export function isActiveUser(user: { activo?: boolean | null } | null | undefined): boolean {
  return !!user?.activo
}

// Granular permissions for producto_parametros
// - Read: admin, supervisor, viewer, agente
// - Create/Update: admin, supervisor
// - Delete: admin, supervisor
const READ_ROLES: AppRole[] = ['admin','supervisor','viewer','agente']
const WRITE_ROLES: AppRole[] = ['admin','supervisor']
const DELETE_ROLES: AppRole[] = ['admin','supervisor']
const SUPER_ROLES: AppRole[] = ['admin','supervisor']

export function canReadProductoParametros(rol?: string | null): boolean {
  const r = normalizeRole(rol)
  return r != null && READ_ROLES.includes(r)
}

export function canWriteProductoParametros(rol?: string | null): boolean {
  const r = normalizeRole(rol)
  return r != null && WRITE_ROLES.includes(r)
}

export function canDeleteProductoParametros(rol?: string | null): boolean {
  const r = normalizeRole(rol)
  return r != null && DELETE_ROLES.includes(r)
}

export function isSuperRole(rol?: string | null): boolean {
  const r = normalizeRole(rol)
  return r != null && SUPER_ROLES.includes(r)
}
