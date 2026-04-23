import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { isSuperRole } from '@/lib/roles'
import { logAccion } from '@/lib/logger'

// DELETE — soft-delete de un fondo (activo=false) + elimina del storage
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const usuario = await getUsuarioSesion()
    if (!usuario) return NextResponse.json({ success: false, message: 'No autenticado' }, { status: 401 })
    if (!isSuperRole(usuario.rol)) return NextResponse.json({ success: false, message: 'Sin permiso' }, { status: 403 })

    const supabase = ensureAdminClient()

    // Obtener el registro para saber el storage_path
    const { data: fondo, error: fetchError } = await supabase
      .from('zoom_fondos')
      .select('id, storage_path, activo')
      .eq('id', id)
      .single()

    if (fetchError || !fondo) {
      return NextResponse.json({ success: false, message: 'Fondo no encontrado' }, { status: 404 })
    }

    // Soft-delete
    const { error: updateError } = await supabase
      .from('zoom_fondos')
      .update({ activo: false })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ success: false, message: updateError.message }, { status: 500 })
    }

    // Eliminar archivo del storage (best-effort)
    if (fondo.storage_path) {
      await supabase.storage.from('zoom-fondos').remove([fondo.storage_path])
    }

    await logAccion('zoom_fondo_eliminado', { usuario: usuario.email, tabla_afectada: 'zoom_fondos', snapshot: { id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
