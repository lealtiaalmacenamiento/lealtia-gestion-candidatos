import { ensureAdminClient } from '@/lib/supabaseAdmin'
import type { ProductType } from '@/types'

const PRODUCT_TYPE_FIELDS = 'id,code,name,description,active,created_at,updated_at'

type ProductTypeRow = {
  id: string
  code: string
  name: string
  description?: string | null
  active: boolean
  created_at?: string
  updated_at?: string
}

export type ProductTypeWithUsage = ProductType & { usageCount: number }

interface FetchProductTypesOptions {
  includeInactive?: boolean
}

interface ProductTypeInput {
  code: string
  name: string
  description?: string | null
  active?: boolean
}

function mapRow(row: ProductTypeRow): ProductType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    active: Boolean(row.active),
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

async function getActiveUsageCounts(typeIds: string[]): Promise<Map<string, number>> {
  const supabase = ensureAdminClient()
  if (typeIds.length === 0) {
    return new Map()
  }
  const uniqueIds = Array.from(new Set(typeIds))
  const { data, error } = await supabase
    .from('producto_parametros')
    .select('id, product_type_id')
    .eq('activo', true)
    .in('product_type_id', uniqueIds)

  if (error) {
    throw new Error(`[productTypes] No se pudo obtener uso de tipos: ${error.message}`)
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const key = row.product_type_id as string | null
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export async function fetchProductTypes(options: FetchProductTypesOptions = {}): Promise<ProductTypeWithUsage[]> {
  const { includeInactive = false } = options
  const supabase = ensureAdminClient()
  let query = supabase
    .from('product_types')
    .select(PRODUCT_TYPE_FIELDS)
    .order('name', { ascending: true })
  if (!includeInactive) {
    query = query.eq('active', true)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`[productTypes] No se pudieron obtener los tipos de póliza: ${error.message}`)
  }

  const rows = (data ?? []) as ProductTypeRow[]
  const counts = await getActiveUsageCounts(rows.map(row => row.id))

  return rows.map(row => ({
    ...mapRow(row),
    usageCount: counts.get(row.id) ?? 0
  }))
}

export async function createProductType(input: ProductTypeInput): Promise<ProductTypeWithUsage> {
  const code = input.code?.trim().toUpperCase()
  const name = input.name?.trim()
  if (!code) {
    throw new Error('El código del tipo de póliza es obligatorio')
  }
  if (!/^[A-Z0-9_-]{2,16}$/.test(code)) {
    throw new Error('El código debe tener de 2 a 16 caracteres alfanuméricos (guion y guion bajo permitidos)')
  }
  if (!name) {
    throw new Error('El nombre del tipo de póliza es obligatorio')
  }
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('product_types')
    .insert({
      code,
      name,
      description: input.description?.trim() || null,
      active: input.active ?? true
    })
    .select(PRODUCT_TYPE_FIELDS)
    .single()

  if (error || !data) {
    const message = error?.message ?? 'sin datos'
    if (message.includes('duplicate') || message.includes('unique')) {
      throw new Error('Ya existe un tipo de póliza con ese código')
    }
    throw new Error(`[productTypes] Error al crear tipo de póliza: ${message}`)
  }

  const row = data as ProductTypeRow
  return { ...mapRow(row), usageCount: 0 }
}

export async function updateProductType(id: string, input: Partial<ProductTypeInput>): Promise<ProductTypeWithUsage> {
  if (!id) {
    throw new Error('Tipo de póliza inválido')
  }
  const updates: Record<string, unknown> = {}
  if (input.code !== undefined) {
    const code = input.code.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{2,16}$/.test(code)) {
      throw new Error('El código debe tener de 2 a 16 caracteres alfanuméricos (guion y guion bajo permitidos)')
    }
    updates.code = code
  }
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) {
      throw new Error('El nombre del tipo de póliza es obligatorio')
    }
    updates.name = name
  }
  if (input.description !== undefined) {
    updates.description = input.description?.trim() || null
  }
  if (input.active !== undefined) {
    updates.active = Boolean(input.active)
  }
  if (Object.keys(updates).length === 0) {
    throw new Error('No hay cambios por aplicar en el tipo de póliza')
  }

  const supabase = ensureAdminClient()

  if (updates.active === false) {
    const counts = await getActiveUsageCounts([id])
    const usage = counts.get(id) ?? 0
    if (usage > 0) {
      throw new Error('No puedes desactivar este tipo porque existen pólizas configuradas que aún lo utilizan')
    }
  }

  const { data, error } = await supabase
    .from('product_types')
    .update(updates)
    .eq('id', id)
    .select(PRODUCT_TYPE_FIELDS)
    .single()

  if (error || !data) {
    const message = error?.message ?? 'sin datos'
    if (message.includes('duplicate') || message.includes('unique')) {
      throw new Error('Ya existe un tipo de póliza con ese código')
    }
    throw new Error(`[productTypes] Error al actualizar tipo de póliza: ${message}`)
  }

  const row = data as ProductTypeRow
  const counts = await getActiveUsageCounts([id])
  return { ...mapRow(row), usageCount: counts.get(id) ?? 0 }
}