import 'dotenv/config'
import { Client } from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

type SegmentRow = { id: string; name: string; active: boolean }
type UsuarioRow = { id: number; email: string | null; is_desarrollador: boolean | null }
type AssignmentRow = { usuario_id: number }

type SupabaseServiceClient = SupabaseClient<Database>

const DEV_DB_URL = process.env.DevDATABASE_URL
  ?? process.env.DEVDATABASE_URL
  ?? process.env.DEV_DATABASE_URL
  ?? null

const SEGMENT_NAME = (process.env.DEV_SEGMENT_NAME ?? 'Desarrolladores comerciales').trim()
const SEGMENT_DESCRIPTION = (process.env.DEV_SEGMENT_DESCRIPTION ?? 'Usuarios habilitados para acompaÃ±ar citas en la agenda interna.').trim()
const REMOVE_ORPHANS = process.env.DEV_SEGMENT_REMOVE_ORPHANS === '1'

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Falta variable de entorno ${key}`)
  }
  return value
}

async function ensureSegmentSupabase(supabase: SupabaseServiceClient): Promise<SegmentRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('segments')
    .select('id,name,active')
    .ilike('name', SEGMENT_NAME)
    .limit(1)

  if (error) {
    throw new Error(`No se pudo consultar segments: ${error.message}`)
  }

  const existing = (data ?? [])[0] as SegmentRow | undefined
  if (existing) {
    if (!existing.active) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updated, error: activationError } = await (supabase as any)
        .from('segments')
        .update({ active: true })
        .eq('id', existing.id)
        .select('id,name,active')
        .maybeSingle()

      if (activationError || !updated) {
        throw new Error(`Segmento encontrado pero no se pudo activar: ${activationError?.message ?? 'sin datos'}`)
      }
      console.log(`Segmento ${SEGMENT_NAME} reactivado`)
      return updated as SegmentRow
    }
    return existing
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertError } = await (supabase as any)
    .from('segments')
    .insert({ name: SEGMENT_NAME, description: SEGMENT_DESCRIPTION, active: true })
    .select('id,name,active')
    .single()

  if (insertError || !inserted) {
    throw new Error(`No se pudo crear el segmento ${SEGMENT_NAME}: ${insertError?.message ?? 'sin datos'}`)
  }

  console.log(`Segmento ${SEGMENT_NAME} creado`)
  return inserted as SegmentRow
}

async function fetchDevelopersSupabase(supabase: SupabaseServiceClient): Promise<UsuarioRow[]> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id,email,is_desarrollador')
    .eq('is_desarrollador', true)

  if (error) {
    throw new Error(`No se pudieron obtener los desarrolladores: ${error.message}`)
  }

  return (data ?? []) as UsuarioRow[]
}

async function fetchAssignmentsSupabase(
  supabase: SupabaseServiceClient,
  segmentId: string
): Promise<AssignmentRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('user_segments')
    .select('usuario_id')
    .eq('segment_id', segmentId)

  if (error) {
    throw new Error(`No se pudieron obtener asignaciones actuales: ${error.message}`)
  }

  return (data ?? []) as AssignmentRow[]
}

async function insertAssignmentsSupabase(
  supabase: SupabaseServiceClient,
  segmentId: string,
  usuarioIds: number[]
): Promise<number> {
  if (usuarioIds.length === 0) return 0
  const rows = usuarioIds.map(usuarioId => ({ usuario_id: usuarioId, segment_id: segmentId }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('user_segments').insert(rows)
  if (error) {
    throw new Error(`Error insertando asignaciones: ${error.message}`)
  }
  return rows.length
}

async function removeAssignmentsSupabase(
  supabase: SupabaseServiceClient,
  segmentId: string,
  usuarioIds: number[]
): Promise<number> {
  if (usuarioIds.length === 0) return 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, count } = await (supabase as any)
    .from('user_segments')
    .delete({ count: 'exact' })
    .eq('segment_id', segmentId)
    .in('usuario_id', usuarioIds)

  if (error) {
    throw new Error(`Error eliminando asignaciones obsoletas: ${error.message}`)
  }
  return count ?? usuarioIds.length
}

async function ensureSegmentPg(client: Client): Promise<SegmentRow> {
  const existing = await client.query<SegmentRow>(
    'select id, name, active from segments where lower(name) = lower($1) limit 1',
    [SEGMENT_NAME]
  )

  const current = existing.rows[0]
  if (current) {
    if (!current.active) {
      const updated = await client.query<SegmentRow>(
        "update segments set active = true, updated_at = timezone('utc'::text, now()) where id = $1 returning id, name, active",
        [current.id]
      )
      const row = updated.rows[0]
      if (!row) {
        throw new Error('Segmento encontrado pero no se pudo reactivar')
      }
      console.log(`Segmento ${SEGMENT_NAME} reactivado`)
      return row
    }
    return current
  }

  const inserted = await client.query<SegmentRow>(
    'insert into segments (name, description, active) values ($1, $2, true) returning id, name, active',
    [SEGMENT_NAME, SEGMENT_DESCRIPTION]
  )

  const row = inserted.rows[0]
  if (!row) {
    throw new Error(`No se pudo crear el segmento ${SEGMENT_NAME}`)
  }

  console.log(`Segmento ${SEGMENT_NAME} creado`)
  return row
}

async function fetchDevelopersPg(client: Client): Promise<UsuarioRow[]> {
  const result = await client.query<UsuarioRow>(
    'select id, email, is_desarrollador from usuarios where coalesce(is_desarrollador, false) = true'
  )
  return result.rows
}

async function fetchAssignmentsPg(client: Client, segmentId: string): Promise<AssignmentRow[]> {
  const result = await client.query<AssignmentRow>(
    'select usuario_id from user_segments where segment_id = $1',
    [segmentId]
  )
  return result.rows
}

async function insertAssignmentsPg(client: Client, segmentId: string, usuarioIds: number[]): Promise<number> {
  if (usuarioIds.length === 0) return 0
  const result = await client.query(
    `insert into user_segments (usuario_id, segment_id)
     select unnest($1::bigint[]), $2::uuid
     on conflict (usuario_id, segment_id) do nothing`,
    [usuarioIds, segmentId]
  )
  return result.rowCount ?? 0
}

async function removeAssignmentsPg(client: Client, segmentId: string, usuarioIds: number[]): Promise<number> {
  if (usuarioIds.length === 0) return 0
  const result = await client.query(
    'delete from user_segments where segment_id = $1 and usuario_id = any($2::bigint[])',
    [segmentId, usuarioIds]
  )
  return result.rowCount ?? 0
}

async function runWithSupabase(url: string, serviceKey: string): Promise<void> {
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } }) as SupabaseServiceClient

  console.log('Origen de datos: Supabase service API')

  const segment = await ensureSegmentSupabase(supabase)
  console.log(`Segmento listo (id=${segment.id})`)

  const developers = await fetchDevelopersSupabase(supabase)
  if (developers.length === 0) {
    console.log('No hay usuarios marcados como desarrolladores. Nada que migrar.')
    return
  }

  const assignments = await fetchAssignmentsSupabase(supabase, segment.id)
  const assignedIds = new Set<number>(assignments.map((row: AssignmentRow) => row.usuario_id))
  const developerIds = developers.map((user: UsuarioRow) => user.id)

  const missingIds = developerIds.filter((id: number) => !assignedIds.has(id))
  const inserted = await insertAssignmentsSupabase(supabase, segment.id, missingIds)

  let removed = 0
  if (REMOVE_ORPHANS) {
    const developerSet = new Set(developerIds)
    const orphanIds = assignments
      .map((row: AssignmentRow) => row.usuario_id)
      .filter((id: number) => !developerSet.has(id))
    removed = await removeAssignmentsSupabase(supabase, segment.id, orphanIds)
  }

  console.log(`MigraciÃ³n completada. Total desarrolladores: ${developerIds.length}`)
  console.log(`Asignaciones insertadas: ${inserted}`)
  if (REMOVE_ORPHANS) {
    console.log(`Asignaciones eliminadas por no corresponder: ${removed}`)
  }
}

async function runWithPg(databaseUrl: string): Promise<void> {
  console.log('Origen de datos: DevDATABASE_URL')
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    const segment = await ensureSegmentPg(client)
    console.log(`Segmento listo (id=${segment.id})`)

    const developers = await fetchDevelopersPg(client)
    if (developers.length === 0) {
      console.log('No hay usuarios marcados como desarrolladores. Nada que migrar.')
      return
    }

    const assignments = await fetchAssignmentsPg(client, segment.id)
    const assignedIds = new Set<number>(assignments.map((row: AssignmentRow) => row.usuario_id))
    const developerIds = developers.map((user: UsuarioRow) => user.id)

    const missingIds = developerIds.filter((id: number) => !assignedIds.has(id))
    const inserted = await insertAssignmentsPg(client, segment.id, missingIds)

    let removed = 0
    if (REMOVE_ORPHANS) {
      const developerSet = new Set(developerIds)
      const orphanIds = assignments
        .map((row: AssignmentRow) => row.usuario_id)
        .filter((id: number) => !developerSet.has(id))
      removed = await removeAssignmentsPg(client, segment.id, orphanIds)
    }

    console.log(`MigraciÃ³n completada. Total desarrolladores: ${developerIds.length}`)
    console.log(`Asignaciones insertadas: ${inserted}`)
    if (REMOVE_ORPHANS) {
      console.log(`Asignaciones eliminadas por no corresponder: ${removed}`)
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function run() {
  console.log(`Usando segmento objetivo: ${SEGMENT_NAME}`)

  if (DEV_DB_URL) {
    await runWithPg(DEV_DB_URL)
    return
  }

  const url = requireEnv('SUPABASE_URL')
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  await runWithSupabase(url, serviceKey)
}

run().catch(err => {
  console.error('[migrate-developers-segment] Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})



