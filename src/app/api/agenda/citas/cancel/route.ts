import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { cancelAgendaCitaCascade } from './cascade'

function canManageAgenda(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (!usuario) return false
  if (usuario.rol === 'admin' || usuario.rol === 'superusuario') return true
  return Boolean(usuario.is_desarrollador)
}

function canCancelAgenda(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (canManageAgenda(usuario)) return true
  return usuario?.rol === 'agente'
}

type CancelPayload = {
  citaId: number
  motivo?: string | null
}

export async function POST(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!canCancelAgenda(actor)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let payload: CancelPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const citaId = Number(payload.citaId)
  if (!Number.isFinite(citaId) || citaId <= 0) {
    return NextResponse.json({ error: 'citaId inválido' }, { status: 400 })
  }

  const motivo = payload.motivo ? String(payload.motivo).trim() : undefined

  const result = await cancelAgendaCitaCascade({
    citaId,
    motivo: motivo || null,
    actor: {
      id: actor.id ?? null,
      id_auth: actor.id_auth ?? null,
      email: actor.email ?? null,
      rol: actor.rol ?? null,
      is_desarrollador: actor.is_desarrollador ?? null
    },
    origin: 'agenda'
  })

  if (!result.success) {
    const status = result.error === 'Cita no encontrada'
      ? 404
      : result.error?.includes('remota')
        ? 502
        : 500
    return NextResponse.json({ error: result.error || 'No se pudo cancelar la cita' }, { status })
  }

  return NextResponse.json({ success: true, alreadyCancelled: result.alreadyCancelled ?? false })
}
