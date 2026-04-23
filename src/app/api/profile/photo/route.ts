import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'

// GET — devuelve una URL firmada (temporal) de la foto de perfil del usuario actual
export async function GET() {
  try {
    const usuario = await getUsuarioSesion()
    if (!usuario) return NextResponse.json({ success: false, message: 'No autenticado' }, { status: 401 })

    const supabase = ensureAdminClient()
    const { data, error } = await supabase
      .from('usuarios')
      .select('foto_perfil_url')
      .eq('id', usuario.id)
      .single()

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

    let storagePath = (data as { foto_perfil_url: string | null }).foto_perfil_url ?? null
    if (!storagePath) return NextResponse.json({ success: true, foto_perfil_url: null })

    // Compatibilidad: si la DB guardaba la URL pública completa (valor anterior),
    // extraer solo el path relativo que espera createSignedUrl
    const publicPathMatch = storagePath.match(/\/fotos-perfil\/(.+?)(?:\?|$)/)
    if (publicPathMatch?.[1]) storagePath = decodeURIComponent(publicPathMatch[1])

    // Generar URL firmada válida por 1 hora
    const { data: signed, error: signError } = await supabase.storage
      .from('fotos-perfil')
      .createSignedUrl(storagePath, 3600)

    if (signError || !signed?.signedUrl) {
      return NextResponse.json({ success: true, foto_perfil_url: null })
    }

    return NextResponse.json({ success: true, foto_perfil_url: signed.signedUrl })
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

// POST — sube o reemplaza la foto de perfil del usuario actual
// Recibe FormData con campo "file" (imagen)
export async function POST(request: Request) {
  try {
    const usuario = await getUsuarioSesion()
    if (!usuario) return NextResponse.json({ success: false, message: 'No autenticado' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, message: 'Se requiere una imagen' }, { status: 400 })
    }

    const mimeType = (file as File).type || 'image/jpeg'
    if (!mimeType.startsWith('image/')) {
      return NextResponse.json({ success: false, message: 'Solo se permiten imágenes' }, { status: 400 })
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: 'La imagen no puede superar 5 MB' }, { status: 400 })
    }

    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
    // Nombre único por subida para evitar caché de CDN de Supabase
    const ts = Date.now()
    const storagePath = `${usuario.id}/photo-${ts}.${ext}`

    const supabase = ensureAdminClient()

    // Borrar cualquier foto anterior del usuario (puede tener distinta extensión/timestamp)
    const { data: existingFiles } = await supabase.storage
      .from('fotos-perfil')
      .list(usuario.id)
    if (existingFiles && existingFiles.length > 0) {
      const oldPaths = existingFiles.map(f => `${usuario.id}/${f.name}`)
      await supabase.storage.from('fotos-perfil').remove(oldPaths)
    }

    const arrayBuffer = await file.arrayBuffer()

    // Subir nueva foto con nombre único (sin upsert ya que el archivo es nuevo)
    const { error: uploadError } = await supabase.storage
      .from('fotos-perfil')
      .upload(storagePath, arrayBuffer, { contentType: mimeType, upsert: false })

    if (uploadError) {
      return NextResponse.json({ success: false, message: uploadError.message }, { status: 500 })
    }

    // Guardar el storage path (no la URL pública) — el bucket es privado
    const { error: updateError } = await supabase
      .from('usuarios')
      .update({ foto_perfil_url: storagePath })
      .eq('id', usuario.id)

    if (updateError) {
      return NextResponse.json({ success: false, message: updateError.message }, { status: 500 })
    }

    // Devolver URL firmada temporal para que el cliente la muestre de inmediato
    const { data: signed, error: signError } = await supabase.storage
      .from('fotos-perfil')
      .createSignedUrl(storagePath, 3600)

    if (signError || !signed?.signedUrl) {
      return NextResponse.json({ success: false, message: 'Error generando URL firmada' }, { status: 500 })
    }

    await logAccion('foto_perfil_actualizada', { usuario: usuario.email, tabla_afectada: 'usuarios', id_registro: usuario.id })

    return NextResponse.json({ success: true, foto_perfil_url: signed.signedUrl })
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

// DELETE — elimina la foto de perfil del usuario actual
export async function DELETE() {
  try {
    const usuario = await getUsuarioSesion()
    if (!usuario) return NextResponse.json({ success: false, message: 'No autenticado' }, { status: 401 })

    const supabase = ensureAdminClient()

    // Obtener la URL actual para saber la extensión
    const { data: userData } = await supabase
      .from('usuarios')
      .select('foto_perfil_url')
      .eq('id', usuario.id)
      .single()

    // foto_perfil_url ahora almacena directamente el storage path
    const storagePath = (userData as { foto_perfil_url: string | null } | null)?.foto_perfil_url
    if (storagePath) {
      await supabase.storage.from('fotos-perfil').remove([storagePath])
    }

    const { error } = await supabase
      .from('usuarios')
      .update({ foto_perfil_url: null })
      .eq('id', usuario.id)

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

    await logAccion('foto_perfil_eliminada', { usuario: usuario.email, tabla_afectada: 'usuarios', id_registro: usuario.id })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
