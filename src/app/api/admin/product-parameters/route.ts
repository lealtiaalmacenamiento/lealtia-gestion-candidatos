import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'

interface ProductoParametroRow {
  id: string
  nombre_comercial: string
  tipo_producto: string
  product_type_id: string | null
  product_types: {
    code: string
    name: string
  } | null
}

/**
 * GET /api/admin/product-parameters
 * Lista todos los productos parametrizados disponibles para usar en campañas
 */
export async function GET() {
  try {
    const supabase = ensureAdminClient()

    const { data, error } = await supabase
      .from('producto_parametros')
      .select(`
        id,
        nombre_comercial,
        tipo_producto,
        product_type_id,
        product_types (
          code,
          name
        )
      `)
      .order('nombre_comercial', { ascending: true })

    if (error) {
      console.error('[product-parameters] Error fetching:', error)
      return NextResponse.json(
        { error: 'Error al consultar productos parametrizados' },
        { status: 500 }
      )
    }

    // Formatear respuesta para incluir información útil
    const rawData = (data || []) as unknown as ProductoParametroRow[]
    const formatted = rawData.map((producto) => ({
      id: producto.id,
      tipo_producto: producto.tipo_producto,
      product_type_code: producto.product_types?.code || producto.tipo_producto,
      product_type_name: producto.product_types?.name || 'Sin nombre',
      display_name: producto.nombre_comercial
    }))

    return NextResponse.json(formatted)
  } catch (err) {
    console.error('[product-parameters] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
