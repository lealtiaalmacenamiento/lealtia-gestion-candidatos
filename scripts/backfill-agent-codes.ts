import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

/**
 * Backfill de códigos de agente para candidatos existentes.
 * Reglas: iniciales del nombre del candidato + últimos 4 dígitos de CT.
 * Aplica a usuarios con rol agente/supervisor/admin que tengan email en candidatos.
 *
 * Run: ts-node scripts/backfill-agent-codes.ts
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

function isServiceRoleKey(key: string | undefined): boolean {
  if (!key) return false
  const parts = key.split('.')
  if (parts.length < 2) return false
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

if (!isServiceRoleKey(SERVICE_KEY)) {
  console.error('La key no es service_role; use SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function normalizeInitials(nombre?: string | null): string | null {
  if (!nombre) return null
  const ascii = nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const parts = ascii.split(/\s+/).filter(Boolean)
  if (!parts.length) return null
  return parts.map(p => p[0]!.toUpperCase()).join('')
}

function last4Digits(ct?: string | null): string | null {
  if (!ct) return null
  const digits = String(ct).replace(/\D/g, '')
  if (!digits) return null
  return digits.slice(-4)
}

function buildCodigo(nombre?: string | null, ct?: string | null): string | null {
  const initials = normalizeInitials(nombre)
  const last4 = last4Digits(ct)
  if (!initials || !last4) return null
  return `${initials}${last4}`.toUpperCase()
}

async function main() {
  console.log('🔎 Cargando candidatos con email_agente y CT...')
  const { data: candidatos, error: candErr } = await supabase
    .from('candidatos')
    .select('id_candidato, candidato, ct, email_agente, eliminado')
    .not('email_agente', 'is', null)
    .not('ct', 'is', null)
    .eq('eliminado', false)

  if (candErr) throw new Error('Error leyendo candidatos: ' + candErr.message)
  if (!candidatos?.length) {
    console.log('No hay candidatos elegibles.')
    return
  }

  const emailSet = new Set<string>()
  for (const c of candidatos) {
    const email = (c.email_agente || '').toString().trim().toLowerCase()
    if (email) emailSet.add(email)
  }

  const emails = Array.from(emailSet)
  console.log(`📧 Emails únicos: ${emails.length}`)

  const { data: usuarios, error: userErr } = await supabase
    .from('usuarios')
    .select('id, email, rol, nombre')
    .in('email', emails)
    .in('rol', ['agente', 'supervisor', 'admin'])

  if (userErr) throw new Error('Error leyendo usuarios: ' + userErr.message)

  const userByEmail = new Map<string, { id: number; rol: string; nombre: string | null }>()
  for (const u of usuarios || []) {
    userByEmail.set((u.email || '').toLowerCase(), { id: u.id, rol: u.rol, nombre: u.nombre ?? null })
  }

  let created = 0
  let skipped = 0
  let errors = 0

  for (const cand of candidatos) {
    const email = (cand.email_agente || '').toString().trim().toLowerCase()
    const user = userByEmail.get(email)
    if (!user) { skipped++; continue }

    const code = buildCodigo(cand.candidato, cand.ct)
    if (!code) { skipped++; continue }

    const { error } = await supabase
      .from('agent_codes')
      .upsert({
        code,
        agente_id: user.id,
        nombre_agente: cand.candidato,
        activo: true
      }, { onConflict: 'code' })

    if (error) {
      errors++
      console.error(`❌ ${code} (${cand.id_candidato}) -> ${error.message}`)
    } else {
      created++
      console.log(`✅ ${code} (${cand.id_candidato}) para usuario ${user.id}`)
    }
  }

  console.log('--- resumen ---')
  console.log({ created, skipped, errors })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
