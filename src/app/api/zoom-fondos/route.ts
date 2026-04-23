import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { isSuperRole } from '@/lib/roles'
import { logAccion } from '@/lib/logger'
import type { ZoomFondo } from '@/types'

// GET — lista todos los fondos activos con URLs firmadas (bucket privado)
export async function GET() {
  try {
    const supabase = ensureAdminClient()
    const { data, error } = await supabase
      .from('zoom_fondos')
      .select('*')
      .eq('activo', true)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

    const fondos = (data as ZoomFondo[])
    if (fondos.length === 0) return NextResponse.json({ success: true, data: [] })

    // Generar URLs firmadas en batch (válidas 1 hora)
    const paths = fondos.map(f => f.storage_path)
    const { data: signed, error: signError } = await supabase.storage
      .from('zoom-fondos')
      .createSignedUrls(paths, 3600)

    if (signError) return NextResponse.json({ success: false, message: signError.message }, { status: 500 })

    const signedMap = new Map((signed ?? []).map(s => [s.path, s.signedUrl]))
    const result = fondos.map(f => ({ ...f, public_url: signedMap.get(f.storage_path) ?? '' }))

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

// POST — sube un nuevo fondo (solo supervisor/admin)
// Recibe FormData con campo "file" (imagen)
export async function POST(request: Request) {
  try {
    const usuario = await getUsuarioSesion()
    if (!usuario) return NextResponse.json({ success: false, message: 'No autenticado' }, { status: 401 })
    if (!isSuperRole(usuario.rol)) return NextResponse.json({ success: false, message: 'Sin permiso' }, { status: 403 })

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, message: 'Se requiere un archivo de imagen' }, { status: 400 })
    }

    // Validar tipo de archivo
    const mimeType = (file as File).type || 'image/jpeg'
    if (!mimeType.startsWith('image/')) {
      return NextResponse.json({ success: false, message: 'Solo se permiten imágenes' }, { status: 400 })
    }

    // Validar tamaño (max 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: 'La imagen no puede superar 10 MB' }, { status: 400 })
    }

    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const storagePath = `fondos/${fileName}`

    const supabase = ensureAdminClient()

    // Subir al bucket
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('zoom-fondos')
      .upload(storagePath, arrayBuffer, { contentType: mimeType, upsert: false })

    if (uploadError) {
      return NextResponse.json({ success: false, message: uploadError.message }, { status: 500 })
    }

    // Generar URL firmada para devolver al cliente
    const { data: signed, error: signError } = await supabase.storage
      .from('zoom-fondos')
      .createSignedUrl(storagePath, 3600)

    if (signError || !signed?.signedUrl) {
      await supabase.storage.from('zoom-fondos').remove([storagePath])
      return NextResponse.json({ success: false, message: 'Error generando URL firmada' }, { status: 500 })
    }

    // Insertar registro en tabla (public_url guarda la URL firmada inicial)
    const { data: row, error: insertError } = await supabase
      .from('zoom_fondos')
      .insert({ storage_path: storagePath, public_url: signed.signedUrl, uploaded_by: usuario.id_auth ?? null })
      .select()
      .single()

    if (insertError) {
      // Intentar limpiar el archivo subido
      await supabase.storage.from('zoom-fondos').remove([storagePath])
      return NextResponse.json({ success: false, message: insertError.message }, { status: 500 })
    }

    await logAccion('zoom_fondo_creado', { usuario: usuario.email, tabla_afectada: 'zoom_fondos', snapshot: { storagePath, id: (row as ZoomFondo).id } })

    return NextResponse.json({ success: true, data: row as ZoomFondo }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
