/**
 * Seed base segments and assign them to users according to their roles.
 *
 * Usage (from project root):
 *   npx ts-node --esm scripts/seed-segments.ts
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
 * (they can be loaded from .env.local).
 */
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_ENV_FILES = [
  process.env.SEGMENTS_ENV_PATH,
  '.env.local',
  '.env'
]

for (const candidate of DEFAULT_ENV_FILES) {
  if (!candidate) continue
  const absolutePath = path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate)
  if (existsSync(absolutePath)) {
    loadEnv({ path: absolutePath, override: true })
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno')
  process.exit(1)
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
})

type SegmentSpec = {
  name: string
  description: string
  roles: string[]
}

type UsuarioRow = {
  id: number
  rol: string | null
  activo: boolean | null
}

const SEGMENTS: SegmentSpec[] = [
  {
    name: 'Asesores',
    description: 'Segmento base para asesores (agentes) activos.',
    roles: ['agente']
  },
  {
    name: 'Promotores',
    description: 'Segmento base para promotores (supervisores) activos.',
    roles: ['supervisor']
  },
  {
    name: 'Agentes activos',
    description: 'Usuarios con rol agente y estado activo.',
    roles: ['agente']
  },
  {
    name: 'Supervisores y administradores',
    description: 'Supervisores y administradores activos.',
    roles: ['supervisor', 'admin']
  }
]

async function ensureSegment(name: string, description: string): Promise<{ id: string }> {
  const existing = await supabase
    .from('segments')
    .select('id, description')
    .eq('name', name)
    .maybeSingle()

  if (existing.error && existing.error.code !== 'PGRST116') {
    throw existing.error
  }

  if (existing.data) {
    // Update description if changed
    if (description && description !== existing.data.description) {
      const update = await supabase
        .from('segments')
        .update({ description })
        .eq('id', existing.data.id)
      if (update.error) throw update.error
    }
    return { id: existing.data.id }
  }

  const insert = await supabase
    .from('segments')
    .insert({ name, description })
    .select('id')
    .single()

  if (insert.error || !insert.data) {
    throw insert.error ?? new Error(`No se pudo crear segmento ${name}`)
  }

  return { id: insert.data.id }
}

async function fetchUsuarios(): Promise<UsuarioRow[]> {
  const res = await supabase
    .from('usuarios')
    .select('id, rol, activo')
  if (res.error) throw res.error
  return res.data ?? []
}

function normalizeRole(rol: string | null): string {
  return (rol ?? '').trim().toLowerCase()
}

async function syncAssignments(segmentId: string, targetUserIds: number[]): Promise<void> {
  const current = await supabase
    .from('user_segments')
    .select('usuario_id')
    .eq('segment_id', segmentId)

  if (current.error) throw current.error

  const currentIds = new Set((current.data ?? []).map((row) => row.usuario_id))
  const targetSet = new Set(targetUserIds)

  const toInsert = targetUserIds.filter((id) => !currentIds.has(id))
  const toRemove = Array.from(currentIds).filter((id) => !targetSet.has(id))

  if (toInsert.length) {
    const payload = toInsert.map((usuarioId) => ({ usuario_id: usuarioId, segment_id: segmentId }))
    const insert = await supabase
      .from('user_segments')
      .insert(payload)
    if (insert.error) throw insert.error
  }

  if (toRemove.length) {
    const del = await supabase
      .from('user_segments')
      .delete()
      .eq('segment_id', segmentId)
      .in('usuario_id', toRemove)
    if (del.error) throw del.error
  }

  console.log(`  → Segmento ${segmentId}: asignados ${toInsert.length}, removidos ${toRemove.length}`)
}

async function main(): Promise<void> {
  console.log('→ Seed segmentos: iniciando')

  const usuarios = await fetchUsuarios()
  const activos = usuarios.filter((u) => u.activo !== false)

  for (const spec of SEGMENTS) {
    const segment = await ensureSegment(spec.name, spec.description)
    const roles = spec.roles.map((r) => r.toLowerCase())
    const targetIds = activos
      .filter((u) => roles.includes(normalizeRole(u.rol)))
      .map((u) => u.id)

    await syncAssignments(segment.id, targetIds)
    console.log(`✓ Segmento "${spec.name}" sincr. (${targetIds.length} usuarios)`)
  }

  console.log('✔ Seed segmentos completado')
}

main().catch((error) => {
  console.error('❌ Seed segmentos falló:', error)
  process.exit(1)
})
