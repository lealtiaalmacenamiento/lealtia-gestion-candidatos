// Verificar que la service role key sea válida y tenga el rol correcto
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

if (!key) {
  console.error('❌ No se encontró SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Decodificar JWT (sin verificar firma, solo para inspección)
const parts = key.split('.')
if (parts.length !== 3) {
  console.error('❌ La key no parece ser un JWT válido')
  process.exit(1)
}

const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
console.log('✅ JWT payload:', JSON.stringify(payload, null, 2))

if (payload.role === 'service_role') {
  console.log('✅ La key tiene rol service_role')
} else if (payload.role === 'anon') {
  console.error('❌ La key tiene rol anon, NO service_role')
  console.error('Necesitas usar la SUPABASE_SERVICE_ROLE_KEY, no la anon key')
  process.exit(1)
} else {
  console.warn('⚠️ La key tiene rol:', payload.role)
}
