import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getSendPilotApiKey } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

// Allowed CDN/attachment domains from SendPilot.
// Add more patterns here if SP serves attachments from additional hosts.
const ALLOWED_HOSTS = [
  'cdn.sendpilot.ai',
  'media.sendpilot.ai',
  'attachments.sendpilot.ai',
  'storage.googleapis.com',
  's3.amazonaws.com',
]

function isAllowedUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw)
    if (protocol !== 'https:') return false
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawUrl = searchParams.get('url')
  if (!rawUrl) {
    return NextResponse.json({ error: 'Parámetro url requerido' }, { status: 400 })
  }

  if (!isAllowedUrl(rawUrl)) {
    return NextResponse.json({ error: 'URL no permitida' }, { status: 403 })
  }

  const apiKey = await getSendPilotApiKey()

  // Proxy the request, forwarding the SP API key so authenticated CDN URLs work
  let upstream: Response
  try {
    upstream = await fetch(rawUrl, {
      headers: {
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        // Forward a generic browser UA so CDNs don't block server-side fetches
        'User-Agent': 'Mozilla/5.0 (compatible; LealtiaProxy/1.0)',
      },
    })
  } catch (err) {
    console.error('[attachment proxy] Fetch error', { url: rawUrl, err })
    return NextResponse.json({ error: 'Error al obtener el adjunto' }, { status: 502 })
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `El servidor remoto respondió ${upstream.status}` },
      { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 }
    )
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
  const contentLength = upstream.headers.get('content-length')

  // Stream the body back to the browser
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  }
  if (contentLength) headers['Content-Length'] = contentLength

  return new Response(upstream.body, { status: 200, headers })
}
