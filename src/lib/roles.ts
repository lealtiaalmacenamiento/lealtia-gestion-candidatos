export type AppRole = 'admin' | 'superusuario' | 'super_usuario' | 'supervisor' | 'editor' | 'lector' | 'agente'

export function normalizeRole(rol?: string | null): AppRole | null {
  if (!rol) return null
  const r = String(rol).trim().toLowerCase()
  if (r === 'super usuario') return 'super_usuario'
  if (r === 'superusuario' || r === 'super_usuario') return r as AppRole
  if (r === 'admin' || r === 'supervisor' || r === 'editor' || r === 'lector' || r === 'agente') return r as AppRole
  return r as AppRole
}

export function isActiveUser(user: { activo?: boolean | null } | null | undefined): boolean {
  return !!user?.activo
}

// Granular permissions for producto_parametros
// - Read: admin, superusuario/super_usuario, supervisor, editor, lector
// - Create/Update: admin, superusuario/super_usuario, supervisor, editor
// - Delete: admin, superusuario/super_usuario, supervisor
const READ_ROLES: AppRole[] = ['admin','superusuario','super_usuario','supervisor','editor','lector']
const WRITE_ROLES: AppRole[] = ['admin','superusuario','super_usuario','supervisor','editor']
const DELETE_ROLES: AppRole[] = ['admin','superusuario','super_usuario','supervisor']

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
