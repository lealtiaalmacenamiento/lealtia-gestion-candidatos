import { NextRequest, NextResponse } from 'next/server'
import { createSegment, fetchSegments, updateSegment } from '@/lib/segments'
import { ensureSuper } from '@/lib/apiGuards'

export async function GET(request: NextRequest) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === '1'
    const segments = await fetchSegments({ includeInactive })
    return NextResponse.json({ segments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }
    const segment = await createSegment({
      name: typeof body.name === 'string' ? body.name : '',
      description: body.description ?? null,
      active: body.active === undefined ? true : Boolean(body.active)
    })
    return NextResponse.json({ segment }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    const status = message.includes('obligatorio') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }
    const { id } = body as { id?: string }
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Falta id del segmento' }, { status: 400 })
    }
    const segment = await updateSegment(id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      description: body.description,
      active: body.active
    })
    return NextResponse.json({ segment })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    const status = message.includes('obligatorio') || message.includes('aplicar') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
