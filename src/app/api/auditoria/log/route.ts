import { NextResponse } from 'next/server'
import { logAccion } from '@/lib/logger'
import { getUsuarioSesion } from '@/lib/auth'

export const runtime = 'nodejs'

type Body = {
  action: string
  snapshot?: unknown
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const h = request.headers
    const contentType = (h.get('content-type') || '').toLowerCase()
    let body: Body | null = null
    if (contentType.includes('application/json')) {
      body = (await request.json()) as Body
    } else if (contentType.includes('text/plain')) {
      try { body = JSON.parse(await request.text()) as Body } catch { body = null }
    } else {
      // Try anyway
      try { body = (await request.json()) as Body } catch { body = null }
    }
    if (!body || !body.action || typeof body.action !== 'string') {
      return NextResponse.json({ ok: false, error: 'action requerido' }, { status: 400 })
    }

    // Resolve usuario en server (cookies/bearer)
    const usuario = await getUsuarioSesion(h as unknown as Headers)
    const ipHdr = h.get('x-forwarded-for') || h.get('x-real-ip') || ''
    const ip = ipHdr.split(',')[0]?.trim() || null
    const ua = h.get('user-agent') || null
    const referer = h.get('referer') || h.get('referrer') || null
    const path = url.pathname

    const meta = {
      ua,
      ip,
      referer,
      url: path,
      ts: new Date().toISOString()
    }
    const snapshot = body.snapshot ? { ...((body.snapshot as Record<string, unknown>) || {}), _req: meta } : { _req: meta }

    // Guardar en el mismo historial con tabla_afectada = 'ui'
    await logAccion(body.action, {
      usuario: usuario?.email || undefined,
      tabla_afectada: 'ui',
      id_registro: 0,
      snapshot
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'error interno' }, { status: 500 })
  }
}
