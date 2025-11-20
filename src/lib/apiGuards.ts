import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion, type UsuarioSesion } from '@/lib/auth'
import { isSuperRole } from '@/lib/roles'

export type SuperGuardResult =
  | { kind: 'ok'; usuario: UsuarioSesion }
  | { kind: 'error'; response: NextResponse<{ error: string }> }

export async function ensureSuper(request: NextRequest): Promise<SuperGuardResult> {
  const usuario = await getUsuarioSesion(request.headers)
  if (!usuario || !isSuperRole(usuario.rol)) {
    return { kind: 'error', response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { kind: 'ok', usuario }
}
