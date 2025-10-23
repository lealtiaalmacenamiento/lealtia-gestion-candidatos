import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    zoomClientId: process.env.ZOOM_CLIENT_ID ?? null,
    hasSecret: Boolean(process.env.ZOOM_CLIENT_SECRET)
  })
}
