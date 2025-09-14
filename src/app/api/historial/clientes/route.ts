import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Endpoint deprecado: use /api/historial/solicitudes
export async function GET() {
  return NextResponse.json(
    { error: 'Este endpoint fue deprecado. Use /api/historial/solicitudes' },
    { status: 410 }
  )
}
