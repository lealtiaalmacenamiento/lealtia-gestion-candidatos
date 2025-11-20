import { NextRequest, NextResponse } from 'next/server'
import { ensureSuper } from '@/lib/apiGuards'
import { fetchAssignmentsBySegment, syncSegmentAssignments } from '@/lib/segments'

interface RouteParams {
  segmentId: string
}

interface RouteContext {
  params: Promise<RouteParams>
}

function parseSegmentId(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const { segmentId: rawSegmentId } = await context.params
    const segmentId = parseSegmentId(rawSegmentId)
    if (!segmentId) {
      return NextResponse.json({ error: 'Segmento inválido' }, { status: 400 })
    }

    const assignments = await fetchAssignmentsBySegment(segmentId)
    return NextResponse.json({ assignments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const { segmentId: rawSegmentId } = await context.params
    const segmentId = parseSegmentId(rawSegmentId)
    if (!segmentId) {
      return NextResponse.json({ error: 'Segmento inválido' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const usuarioIds = Array.isArray((body as { usuarioIds?: unknown }).usuarioIds)
      ? (body as { usuarioIds: unknown[] }).usuarioIds.map(value => Number(value)).filter(value => Number.isInteger(value))
      : null

    if (!usuarioIds) {
      return NextResponse.json({ error: 'Debes indicar usuarioIds' }, { status: 400 })
    }

    const assignments = await syncSegmentAssignments({
      segmentId,
      targetUsuarioIds: usuarioIds,
      assignedBy: guard.usuario.id
    })

    return NextResponse.json({ assignments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    const status = message.includes('invalid') || message.includes('inválido') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
