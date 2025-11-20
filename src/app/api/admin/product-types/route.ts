import { NextRequest, NextResponse } from 'next/server'
import { ensureSuper } from '@/lib/apiGuards'
import { createProductType, fetchProductTypes, updateProductType } from '@/lib/productTypes'

export async function GET(request: NextRequest) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === '1'
    const productTypes = await fetchProductTypes({ includeInactive })
    return NextResponse.json({ productTypes })
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
    const productType = await createProductType({
      code: typeof body.code === 'string' ? body.code : '',
      name: typeof body.name === 'string' ? body.name : '',
      description: typeof body.description === 'string' ? body.description : null,
      active: body.active === undefined ? true : Boolean(body.active)
    })
    return NextResponse.json({ productType }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    const status = message.includes('obligatorio') || message.includes('código') || message.includes('existe') ? 400 : 500
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
    if (!id) {
      return NextResponse.json({ error: 'Falta id del tipo de póliza' }, { status: 400 })
    }
    const productType = await updateProductType(id, {
      code: typeof body.code === 'string' ? body.code : undefined,
      name: typeof body.name === 'string' ? body.name : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      active: typeof body.active === 'boolean' ? body.active : undefined
    })
    return NextResponse.json({ productType })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    const status = message.includes('obligatorio') || message.includes('código') || message.includes('cambios') || message.includes('existe') || message.includes('desactivar')
      ? 400
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}

