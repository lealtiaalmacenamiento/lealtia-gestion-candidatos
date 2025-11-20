import { ensureAdminClient } from '@/lib/supabaseAdmin'
import type { Segment, UserSegmentAssignment } from '@/types'

const SEGMENT_FIELDS = 'id,name,description,active,created_at,updated_at'
const ASSIGNMENT_FIELDS = 'usuario_id,segment_id,assigned_at,assigned_by,segment:segments(id,name,description,active,created_at,updated_at)'

type CreateSegmentInput = {
  name: string
  description?: string | null
  active?: boolean
}

type AssignmentInput = {
  usuarioId: number
  segmentId?: string
  segmentName?: string
  assignedBy: number
}

type RemovalInput = {
  usuarioId: number
  segmentId?: string
  segmentName?: string
}

type AssignmentRow = Record<string, unknown>

function mapAssignmentRows(rows: AssignmentRow[]): UserSegmentAssignment[] {
  return rows.map((row: AssignmentRow) => ({
    usuario_id: row.usuario_id as number,
    segment_id: row.segment_id as string,
    assigned_at: row.assigned_at as string | null,
    assigned_by: row.assigned_by as number | null,
    segment: (row.segment as Segment | null | undefined) ?? null
  }))
}

export async function fetchUserSegmentIds(usuarioId: number): Promise<string[]> {
  if (!Number.isInteger(usuarioId)) {
    throw new Error('ID de usuario inválido para segmentos')
  }
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('user_segments')
    .select('segment_id')
    .eq('usuario_id', usuarioId)

  if (error) {
    throw new Error(`[segments] Error al obtener segmentos del usuario: ${error.message}`)
  }

  return (data ?? []).map(row => row.segment_id as string).filter(Boolean)
}

export async function fetchSegmentsByIds(ids: string[]): Promise<Segment[]> {
  if (!ids || ids.length === 0) return []
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return []
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('segments')
    .select(SEGMENT_FIELDS)
    .in('id', unique)

  if (error) {
    throw new Error(`[segments] Error al consultar segmentos: ${error.message}`)
  }

  return (data ?? []) as Segment[]
}

export async function fetchSegments(options: { includeInactive?: boolean } = {}): Promise<Segment[]> {
  const { includeInactive = false } = options
  const supabase = ensureAdminClient()
  let query = supabase.from('segments').select(SEGMENT_FIELDS).order('name', { ascending: true })
  if (!includeInactive) {
    query = query.eq('active', true)
  }
  const { data, error } = await query
  if (error) {
    throw new Error(`[segments] No se pudieron obtener los segmentos: ${error.message}`)
  }
  return (data ?? []) as Segment[]
}

export async function createSegment(payload: CreateSegmentInput): Promise<Segment> {
  const { name, description = null, active = true } = payload
  if (!name || !name.trim()) {
    throw new Error('El nombre del segmento es obligatorio')
  }
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('segments')
    .insert({ name: name.trim(), description, active })
    .select(SEGMENT_FIELDS)
    .single()

  if (error || !data) {
    throw new Error(`[segments] Error al crear segmento: ${error?.message ?? 'sin datos'}`)
  }
  return data as Segment
}

export async function updateSegment(id: string, payload: Partial<CreateSegmentInput>): Promise<Segment> {
  if (!id) {
    throw new Error('Segmento inválido')
  }
  const supabase = ensureAdminClient()
  const updates: Record<string, unknown> = {}
  if (payload.name !== undefined) updates.name = payload.name?.trim() ?? null
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.active !== undefined) updates.active = payload.active
  if (Object.keys(updates).length === 0) {
    throw new Error('No hay cambios por aplicar en el segmento')
  }
  const { data, error } = await supabase
    .from('segments')
    .update(updates)
    .eq('id', id)
    .select(SEGMENT_FIELDS)
    .single()

  if (error || !data) {
    throw new Error(`[segments] Error al actualizar segmento: ${error?.message ?? 'sin datos'}`)
  }
  return data as Segment
}

export async function listAssignments(usuarioId: number): Promise<UserSegmentAssignment[]> {
  if (!Number.isInteger(usuarioId)) {
    throw new Error('ID de usuario inválido para consultar segmentos')
  }
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('user_segments')
    .select(ASSIGNMENT_FIELDS)
    .eq('usuario_id', usuarioId)
    .order('assigned_at', { ascending: false })

  if (error) {
    throw new Error(`[segments] Error al obtener asignaciones: ${error.message}`)
  }

  return mapAssignmentRows((data ?? []) as AssignmentRow[])
}

export async function fetchAssignmentsBySegment(segmentId: string): Promise<UserSegmentAssignment[]> {
  if (!segmentId) {
    throw new Error('Segmento inválido para consultar asignaciones')
  }
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('user_segments')
    .select(ASSIGNMENT_FIELDS)
    .eq('segment_id', segmentId)
    .order('assigned_at', { ascending: false })

  if (error) {
    throw new Error(`[segments] Error al consultar asignaciones del segmento: ${error.message}`)
  }

  return mapAssignmentRows((data ?? []) as AssignmentRow[])
}

export async function assignSegment(payload: AssignmentInput): Promise<UserSegmentAssignment> {
  const { usuarioId, segmentId, segmentName, assignedBy } = payload
  if (!Number.isInteger(usuarioId)) {
    throw new Error('ID de usuario inválido para asignar segmento')
  }
  if (!Number.isInteger(assignedBy)) {
    throw new Error('ID del asignador inválido')
  }
  const supabase = ensureAdminClient()
  const rpcArgs = {
    p_usuario_id: usuarioId,
    p_assigned_by: assignedBy
  } as Record<string, unknown>

  let rpcName: 'assign_user_segment' | 'assign_user_segment_by_name'
  if (segmentId) {
    rpcName = 'assign_user_segment'
    rpcArgs.p_segment_id = segmentId
  } else if (segmentName && segmentName.trim()) {
    rpcName = 'assign_user_segment_by_name'
    rpcArgs.p_segment_name = segmentName.trim()
  } else {
    throw new Error('Debes indicar segmentId o segmentName para asignar')
  }

  const { data, error } = await supabase.rpc(rpcName, rpcArgs)
  if (error || !data) {
    const baseMessage = error?.message ?? 'sin datos'
    const details = `${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
    const combined = `${baseMessage} ${details}`.toLowerCase()

    if (error && (error.code === '23505' || combined.includes('duplicate key'))) {
      throw new Error('El usuario ya tiene este segmento asignado.')
    }

    if (combined.includes('segment not found') || combined.includes('segmento no encontrado')) {
      throw new Error('No se encontró el segmento solicitado.')
    }

    throw new Error(`[segments] Error al asignar segmento: ${baseMessage}`)
  }

  const assignment: UserSegmentAssignment = {
    usuario_id: data.usuario_id as number,
    segment_id: data.segment_id as string,
    assigned_at: data.assigned_at as string | null,
    assigned_by: data.assigned_by as number | null
  }

  const segment = await supabase
    .from('segments')
    .select(SEGMENT_FIELDS)
    .eq('id', assignment.segment_id)
    .maybeSingle()

  if (segment.data) {
    assignment.segment = segment.data as Segment
  }

  return assignment
}

export async function removeAssignment(payload: RemovalInput): Promise<boolean> {
  const { usuarioId, segmentId, segmentName } = payload
  if (!Number.isInteger(usuarioId)) {
    throw new Error('ID de usuario inválido para eliminar segmento')
  }
  const supabase = ensureAdminClient()
  const rpcArgs = {
    p_usuario_id: usuarioId
  } as Record<string, unknown>

  let rpcName: 'remove_user_segment' | 'remove_user_segment_by_name'
  if (segmentId) {
    rpcName = 'remove_user_segment'
    rpcArgs.p_segment_id = segmentId
  } else if (segmentName && segmentName.trim()) {
    rpcName = 'remove_user_segment_by_name'
    rpcArgs.p_segment_name = segmentName.trim()
  } else {
    throw new Error('Debes indicar segmentId o segmentName para eliminar')
  }

  const { data, error } = await supabase.rpc(rpcName, rpcArgs)
  if (error) {
    throw new Error(`[segments] Error al eliminar segmento: ${error.message}`)
  }
  return Boolean(data)
}

export async function syncSegmentAssignments(options: {
  segmentId: string
  targetUsuarioIds: number[]
  assignedBy: number
}): Promise<UserSegmentAssignment[]> {
  const { segmentId, targetUsuarioIds, assignedBy } = options
  if (!segmentId) {
    throw new Error('Segmento inválido para sincronizar asignaciones')
  }
  if (!Number.isInteger(assignedBy)) {
    throw new Error('Asignador inválido')
  }

  const uniqueTargetIds = Array.from(new Set(targetUsuarioIds.filter(id => Number.isInteger(id))).values()) as number[]
  const currentAssignments = await fetchAssignmentsBySegment(segmentId)
  const currentIds = new Set(currentAssignments.map(assignment => assignment.usuario_id))
  const targetSet = new Set(uniqueTargetIds)

  const toAdd = uniqueTargetIds.filter(id => !currentIds.has(id))
  const toRemove = currentAssignments
    .filter(assignment => !targetSet.has(assignment.usuario_id))
    .map(assignment => assignment.usuario_id)

  if (toAdd.length > 0) {
    await Promise.all(
      toAdd.map(async usuarioId => {
        try {
          await assignSegment({ usuarioId, segmentId, assignedBy })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (message.includes('ya tiene este segmento')) {
            return
          }
          throw error
        }
      })
    )
  }

  if (toRemove.length > 0) {
    await Promise.all(
      toRemove.map(async usuarioId => {
        try {
          await removeAssignment({ usuarioId, segmentId })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (message.includes('segmento no encontrado')) {
            return
          }
          throw error
        }
      })
    )
  }

  return fetchAssignmentsBySegment(segmentId)
}
