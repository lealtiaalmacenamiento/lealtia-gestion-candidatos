export async function GET() {
  return Response.json({
    error: 'Integración OAuth de Zoom deshabilitada. Configura el enlace personal desde /integraciones.'
  }, { status: 410 })
}
