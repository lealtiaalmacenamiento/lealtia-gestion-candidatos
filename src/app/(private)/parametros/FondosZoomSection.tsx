'use client'
import { useEffect, useRef, useState } from 'react'
import type { ZoomFondo } from '@/types'

interface Props {
  onNotify: (msg: string, type: 'success' | 'danger' | 'info' | 'warning') => void
}

export default function FondosZoomSection({ onNotify }: Props) {
  const [open, setOpen] = useState(false)
  const [fondos, setFondos] = useState<ZoomFondo[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFondos = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/zoom-fondos')
      if (res.ok) {
        const j = await res.json() as { success: boolean; data: ZoomFondo[] }
        setFondos(j.data ?? [])
      }
    } catch {
      onNotify('Error cargando fondos', 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && fondos.length === 0) {
      void loadFondos()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      onNotify('Solo se permiten imágenes', 'warning')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      onNotify('La imagen no puede superar 10 MB', 'warning')
      return
    }
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', selectedFile)
      const res = await fetch('/api/zoom-fondos', { method: 'POST', body: fd })
      const j = await res.json() as { success: boolean; data?: ZoomFondo; message?: string }
      if (!res.ok || !j.success) {
        onNotify(j.message ?? 'Error subiendo fondo', 'danger')
        return
      }
      setFondos(prev => [j.data!, ...prev])
      setPreview(null)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onNotify('Fondo subido correctamente', 'success')
    } catch {
      onNotify('Error subiendo fondo', 'danger')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este fondo? La acción no se puede deshacer.')) return
    try {
      const res = await fetch(`/api/zoom-fondos/${id}`, { method: 'DELETE' })
      const j = await res.json() as { success: boolean; message?: string }
      if (!res.ok || !j.success) {
        onNotify(j.message ?? 'Error eliminando fondo', 'danger')
        return
      }
      setFondos(prev => prev.filter(f => f.id !== id))
      onNotify('Fondo eliminado', 'success')
    } catch {
      onNotify('Error eliminando fondo', 'danger')
    }
  }

  const cancelPreview = () => {
    setPreview(null)
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <section className="border rounded p-3 bg-white shadow-sm">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2"
        >
          <i className={`bi bi-caret-${open ? 'down' : 'right'}-fill`}></i>
          <span className="fw-bold small text-uppercase">Fondos de pantalla para Zoom</span>
        </button>
        {open && (
          <button
            type="button"
            className="btn btn-info btn-sm text-white"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <i className="bi bi-upload me-1"></i> Subir fondo
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          {/* Input oculto */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="d-none"
            onChange={handleFileChange}
          />

          {/* Preview del archivo seleccionado */}
          {preview && (
            <div className="border rounded p-3 mb-3 bg-light d-flex align-items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Preview fondo"
                style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 4, border: '1px solid #dee2e6' }}
              />
              <div>
                <p className="small mb-1 fw-semibold">{selectedFile?.name}</p>
                <p className="small text-muted mb-2">{((selectedFile?.size ?? 0) / 1024).toFixed(0)} KB</p>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    onClick={handleUpload}
                    disabled={uploading}
                  >
                    {uploading
                      ? <><span className="spinner-border spinner-border-sm me-1" />Subiendo...</>
                      : <><i className="bi bi-cloud-upload me-1"></i>Guardar</>
                    }
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={cancelPreview}
                    disabled={uploading}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lista de fondos */}
          {loading && (
            <div className="text-center py-3">
              <div className="spinner-border spinner-border-sm" />
            </div>
          )}

          {!loading && fondos.length === 0 && (
            <p className="text-muted small">No hay fondos cargados. Usa el botón &ldquo;Subir fondo&rdquo; para agregar el primero.</p>
          )}

          {!loading && fondos.length > 0 && (
            <div className="row g-3">
              {fondos.map(f => (
                <div key={f.id} className="col-sm-6 col-md-4 col-lg-3">
                  <div className="card h-100 shadow-sm border-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.public_url}
                      alt="Fondo Zoom"
                      className="card-img-top"
                      style={{ height: 90, objectFit: 'cover' }}
                    />
                    <div className="card-body p-2 d-flex justify-content-between align-items-center">
                      <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                        {new Date(f.created_at).toLocaleDateString('es-MX')}
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm py-0 px-1"
                        title="Eliminar fondo"
                        onClick={() => handleDelete(f.id)}
                      >
                        <i className="bi bi-trash3"></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
