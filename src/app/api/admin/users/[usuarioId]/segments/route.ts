import { NextRequest, NextResponse } from 'next/server'
import { assignSegment, listAssignments, removeAssignment } from '@/lib/segments'
import { ensureSuper } from '@/lib/apiGuards'

type RouteParams = { usuarioId: string }
type RouteContext = { params: Promise<RouteParams> }

function parseUsuarioId(raw: string): number | null {
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value)) return null
  return value
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const { usuarioId: rawUsuarioId } = await context.params
    const usuarioId = parseUsuarioId(rawUsuarioId)
    if (!usuarioId) {
      return NextResponse.json({ error: 'ID de usuario inválido' }, { status: 400 })
    }
    const assignments = await listAssignments(usuarioId)
    return NextResponse.json({ assignments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const { usuarioId: rawUsuarioId } = await context.params
    const usuarioId = parseUsuarioId(rawUsuarioId)
    if (!usuarioId) {
      return NextResponse.json({ error: 'ID de usuario inválido' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const segmentId = typeof body.segmentId === 'string' ? body.segmentId : undefined
    const segmentName = typeof body.segmentName === 'string' ? body.segmentName : undefined

    const assignment = await assignSegment({
      usuarioId,
      segmentId,
      segmentName,
      assignedBy: guard.usuario.id
    })

    return NextResponse.json({ assignment }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    const status = message.includes('Debes indicar') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const { usuarioId: rawUsuarioId } = await context.params
    const usuarioId = parseUsuarioId(rawUsuarioId)
    if (!usuarioId) {
      return NextResponse.json({ error: 'ID de usuario inválido' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const segmentId = typeof body.segmentId === 'string' ? body.segmentId : undefined
    const segmentName = typeof body.segmentName === 'string' ? body.segmentName : undefined

    const removed = await removeAssignment({ usuarioId, segmentId, segmentName })
    return NextResponse.json({ success: removed })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    const status = message.includes('Debes indicar') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

