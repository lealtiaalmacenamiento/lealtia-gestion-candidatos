'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import BasePage from '@/components/BasePage'
import type { ZoomFondo } from '@/types'

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const CORNER_LABELS: Record<Corner, string> = {
  'top-left': 'Superior izq.',
  'top-right': 'Superior der.',
  'bottom-left': 'Inferior izq.',
  'bottom-right': 'Inferior der.',
}

const CORNER_ICONS: Record<Corner, string> = {
  'top-left': 'bi-arrow-up-left-square',
  'top-right': 'bi-arrow-up-right-square',
  'bottom-left': 'bi-arrow-down-left-square',
  'bottom-right': 'bi-arrow-down-right-square',
}

// ------- Canvas compositing helper -------
function drawNameOnCanvas(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  SIZE: number,
  corner: Corner
) {
  const fontSize = Math.round(SIZE * 0.16)
  const isBottom = corner === 'bottom-left' || corner === 'bottom-right'
  const textX = x + SIZE / 2
  const textY = isBottom
    ? y - Math.round(SIZE * 0.12)
    : y + SIZE + Math.round(SIZE * 0.26)

  ctx.save()
  ctx.font = `bold ${fontSize}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const metrics = ctx.measureText(name)
  const bgPad = fontSize * 0.4
  const bgH = fontSize * 1.45
  const bgW = metrics.width + bgPad * 2
  const bgX = textX - bgW / 2
  const bgY = textY - bgH / 2
  const bgR = bgH / 2

  ctx.fillStyle = 'rgba(0,0,0,0.52)'
  ctx.beginPath()
  ctx.moveTo(bgX + bgR, bgY)
  ctx.arcTo(bgX + bgW, bgY, bgX + bgW, bgY + bgH, bgR)
  ctx.arcTo(bgX + bgW, bgY + bgH, bgX, bgY + bgH, bgR)
  ctx.arcTo(bgX, bgY + bgH, bgX, bgY, bgR)
  ctx.arcTo(bgX, bgY, bgX + bgW, bgY, bgR)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = 'white'
  ctx.fillText(name, textX, textY)
  ctx.restore()
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  // Fetch as blob to avoid CORS tainted-canvas issues
  const res = await fetch(url)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e) }
    img.src = objectUrl
  })
}

async function compositeAndDownload(
  fondoUrl: string,
  fotoUrl: string | null,
  corner: Corner,
  userName?: string | null
): Promise<void> {
  const canvas = document.createElement('canvas')
  const fondoImg = await loadImageFromUrl(fondoUrl)

  canvas.width = fondoImg.naturalWidth || 1920
  canvas.height = fondoImg.naturalHeight || 1080

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no soportado')

  // Dibujar fondo
  ctx.drawImage(fondoImg, 0, 0, canvas.width, canvas.height)

  // Superponer foto si existe
  if (fotoUrl) {
    const fotoImg = await loadImageFromUrl(fotoUrl)
    const SIZE = Math.round(canvas.width * 0.14) // ~14% del ancho
    const PADDING = Math.round(canvas.width * 0.02)

    // Calcular posición según esquina
    let x = 0; let y = 0
    if (corner === 'top-left')     { x = PADDING;                    y = PADDING }
    if (corner === 'top-right')    { x = canvas.width - SIZE - PADDING;  y = PADDING }
    if (corner === 'bottom-left')  { x = PADDING;                    y = canvas.height - SIZE - PADDING }
    if (corner === 'bottom-right') { x = canvas.width - SIZE - PADDING;  y = canvas.height - SIZE - PADDING }

    // Recorte circular
    ctx.save()
    ctx.beginPath()
    ctx.arc(x + SIZE / 2, y + SIZE / 2, SIZE / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()

    // Dibujar recortado cuadrado de la foto (centrado)
    const srcSize = Math.min(fotoImg.naturalWidth, fotoImg.naturalHeight)
    const srcX = (fotoImg.naturalWidth - srcSize) / 2
    const srcY = (fotoImg.naturalHeight - srcSize) / 2
    ctx.drawImage(fotoImg, srcX, srcY, srcSize, srcSize, x, y, SIZE, SIZE)
    ctx.restore()

    // Borde blanco sutil
    ctx.save()
    ctx.beginPath()
    ctx.arc(x + SIZE / 2, y + SIZE / 2, SIZE / 2, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = Math.max(2, Math.round(SIZE * 0.04))
    ctx.stroke()
    ctx.restore()

    // Nombre del usuario
    if (userName) drawNameOnCanvas(ctx, userName, x, y, SIZE, corner)
  }

  // Descargar
  await new Promise<void>((resolve) => {
    canvas.toBlob(blob => {
      if (!blob) { resolve(); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fondo-zoom.png'
      a.click()
      setTimeout(() => { URL.revokeObjectURL(url); resolve() }, 1000)
    }, 'image/png')
  })
}

// ------- Subcomponente modal de descarga -------
interface DescargarModalProps {
  fondo: ZoomFondo
  fotoUrl: string | null
  userName: string | null
  onClose: () => void
}

function DescargarModal({ fondo, fotoUrl, userName, onClose }: DescargarModalProps) {
  const [corner, setCorner] = useState<Corner>('bottom-right')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [renderingPreview, setRenderingPreview] = useState(false)

  // Renderiza el preview en el canvas cada vez que cambia esquina o se abre
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    const render = async () => {
      setRenderingPreview(true)
      try {
        const fondoImg = await loadImageFromUrl(fondo.public_url)
        if (cancelled) return

        const W = fondoImg.naturalWidth || 1920
        const H = fondoImg.naturalHeight || 1080
        canvas.width = W
        canvas.height = H

        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(fondoImg, 0, 0, W, H)

        if (fotoUrl) {
          const fotoImg = await loadImageFromUrl(fotoUrl)
          if (cancelled) return
          const SIZE = Math.round(W * 0.14)
          const PADDING = Math.round(W * 0.02)
          let x = 0; let y = 0
          if (corner === 'top-left')     { x = PADDING;          y = PADDING }
          if (corner === 'top-right')    { x = W - SIZE - PADDING; y = PADDING }
          if (corner === 'bottom-left')  { x = PADDING;          y = H - SIZE - PADDING }
          if (corner === 'bottom-right') { x = W - SIZE - PADDING; y = H - SIZE - PADDING }

          ctx.save()
          ctx.beginPath()
          ctx.arc(x + SIZE / 2, y + SIZE / 2, SIZE / 2, 0, Math.PI * 2)
          ctx.closePath()
          ctx.clip()
          const srcSize = Math.min(fotoImg.naturalWidth, fotoImg.naturalHeight)
          const srcX = (fotoImg.naturalWidth - srcSize) / 2
          const srcY = (fotoImg.naturalHeight - srcSize) / 2
          ctx.drawImage(fotoImg, srcX, srcY, srcSize, srcSize, x, y, SIZE, SIZE)
          ctx.restore()

          ctx.save()
          ctx.beginPath()
          ctx.arc(x + SIZE / 2, y + SIZE / 2, SIZE / 2, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.85)'
          ctx.lineWidth = Math.max(2, Math.round(SIZE * 0.04))
          ctx.stroke()
          ctx.restore()

          // Nombre del usuario
          if (userName) drawNameOnCanvas(ctx, userName, x, y, SIZE, corner)
        }
      } catch { /* silencioso: preview fallback */ }
      finally { if (!cancelled) setRenderingPreview(false) }
    }
    void render()
    return () => { cancelled = true }
  }, [fondo.public_url, fotoUrl, userName, corner])

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    try {
      await compositeAndDownload(fondo.public_url, fotoUrl, corner, userName)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar la imagen')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      className="modal d-block"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-download me-2"></i>Descargar fondo de Zoom
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {/* Preview canvas — muestra exactamente el resultado final */}
            <div className="mb-3 position-relative rounded overflow-hidden bg-light" style={{ lineHeight: 0 }}>
              <canvas
                ref={canvasRef}
                className="w-100 rounded"
                style={{ display: 'block', maxHeight: 320, objectFit: 'contain' }}
              />
              {renderingPreview && (
                <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ background: 'rgba(255,255,255,0.6)' }}>
                  <div className="spinner-border text-secondary" />
                </div>
              )}
            </div>

            {/* Selector de esquina */}
            <div className="mb-3">
              <label className="form-label small fw-semibold mb-2">
                Posición de tu foto
                {!fotoUrl && <span className="text-muted fw-normal ms-1">(sin foto de perfil — no se superpondrá)</span>}
              </label>
              <div className="d-flex flex-wrap gap-2">
                {(Object.keys(CORNER_LABELS) as Corner[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`btn btn-sm ${corner === c ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setCorner(c)}
                    disabled={!fotoUrl}
                  >
                    <i className={`bi ${CORNER_ICONS[c]} me-1`}></i>
                    {CORNER_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="alert alert-danger small py-2">{error}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading
                ? <><span className="spinner-border spinner-border-sm me-1" />Generando...</>
                : <><i className="bi bi-download me-1"></i>Descargar</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ------- CropModal -------
const CROP_PREVIEW = 320
const CROP_RADIUS = CROP_PREVIEW / 2 - 4
const CROP_CX = CROP_PREVIEW / 2
const CROP_CY = CROP_PREVIEW / 2

interface CropModalProps {
  file: File
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

function CropModal({ file, onConfirm, onCancel }: CropModalProps) {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; ox: number; oy: number }>(
    { active: false, startX: 0, startY: 0, ox: 0, oy: 0 }
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [confirming, setConfirming] = useState(false)

  // Cargar imagen y calcular escala inicial
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const diameter = CROP_RADIUS * 2
      const initial = Math.max(diameter / img.naturalWidth, diameter / img.naturalHeight)
      setScale(initial)
      setOffset({ x: 0, y: 0 })
      setImgEl(img)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Renderizar preview
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgEl) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = CROP_PREVIEW
    canvas.height = CROP_PREVIEW
    ctx.clearRect(0, 0, CROP_PREVIEW, CROP_PREVIEW)
    const iw = imgEl.naturalWidth * scale
    const ih = imgEl.naturalHeight * scale
    ctx.drawImage(imgEl, CROP_CX - iw / 2 + offset.x, CROP_CY - ih / 2 + offset.y, iw, ih)
    // Overlay oscuro con hueco circular
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.rect(0, 0, CROP_PREVIEW, CROP_PREVIEW)
    ctx.arc(CROP_CX, CROP_CY, CROP_RADIUS, 0, Math.PI * 2, true)
    ctx.fill('evenodd' as CanvasFillRule)
    ctx.restore()
    // Borde del círculo
    ctx.save()
    ctx.beginPath()
    ctx.arc(CROP_CX, CROP_CY, CROP_RADIUS, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }, [imgEl, scale, offset])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y }
  }
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return
    const d = dragRef.current
    setOffset({ x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) })
  }
  const handlePointerUp = () => { dragRef.current.active = false }

  const handleConfirm = () => {
    if (!imgEl) return
    setConfirming(true)
    const OUTPUT = 500
    const out = document.createElement('canvas')
    out.width = OUTPUT
    out.height = OUTPUT
    const ctx = out.getContext('2d')
    if (!ctx) { setConfirming(false); return }
    const cropStart = CROP_CX - CROP_RADIUS
    const toOut = OUTPUT / (CROP_RADIUS * 2)
    const iw = imgEl.naturalWidth * scale
    const ih = imgEl.naturalHeight * scale
    const ix = CROP_CX - iw / 2 + offset.x
    const iy = CROP_CY - ih / 2 + offset.y
    ctx.drawImage(imgEl, (ix - cropStart) * toOut, (iy - cropStart) * toOut, iw * toOut, ih * toOut)
    out.toBlob(blob => {
      if (blob) onConfirm(blob)
      setConfirming(false)
    }, 'image/jpeg', 0.92)
  }

  return (
    <div
      className="modal d-block"
      style={{ background: 'rgba(0,0,0,0.6)', zIndex: 1060 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title"><i className="bi bi-crop me-2"></i>Ajustar foto de perfil</h5>
            <button type="button" className="btn-close" onClick={onCancel} />
          </div>
          <div className="modal-body text-center">
            <p className="text-muted small mb-2">Arrastra para reposicionar · Deslizador para zoom</p>
            <div
              className="d-inline-block border border-2"
              style={{ borderRadius: '50%', overflow: 'hidden', lineHeight: 0 }}
            >
              <canvas
                ref={canvasRef}
                width={CROP_PREVIEW}
                height={CROP_PREVIEW}
                style={{ display: 'block', cursor: 'grab', touchAction: 'none', width: CROP_PREVIEW, height: CROP_PREVIEW }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              />
            </div>
            <div className="mt-3 px-4 d-flex align-items-center gap-2">
              <i className="bi bi-zoom-out text-muted"></i>
              <input
                type="range"
                className="form-range flex-grow-1"
                min={0.2}
                max={4}
                step={0.01}
                value={scale}
                onChange={e => setScale(parseFloat(e.target.value))}
              />
              <i className="bi bi-zoom-in text-muted"></i>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={!imgEl || confirming}
            >
              {confirming
                ? <><span className="spinner-border spinner-border-sm me-1" />Procesando...</>
                : <><i className="bi bi-check-lg me-1"></i>Usar esta foto</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ------- Página principal -------
export default function FondosZoomPage() {
  const { user, setUser } = useAuth()
  const [fondos, setFondos] = useState<ZoomFondo[]>([])
  const [loadingFondos, setLoadingFondos] = useState(true)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [loadingFoto, setLoadingFoto] = useState(true)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [notif, setNotif] = useState<{ msg: string; type: string } | null>(null)
  const [fondoModal, setFondoModal] = useState<ZoomFondo | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const fotoInputRef = useRef<HTMLInputElement>(null)

  const showNotif = useCallback((msg: string, type: string) => {
    setNotif({ msg, type })
    setTimeout(() => setNotif(null), 4000)
  }, [])

  // Cargar fondos y foto de perfil en paralelo
  useEffect(() => {
    if (!user) return
    const fetchFondos = async () => {
      setLoadingFondos(true)
      try {
        const res = await fetch('/api/zoom-fondos')
        if (res.ok) {
          const j = await res.json() as { data: ZoomFondo[] }
          setFondos(j.data ?? [])
        }
      } catch { /* ignorar */ }
      finally { setLoadingFondos(false) }
    }
    const fetchFoto = async () => {
      setLoadingFoto(true)
      try {
        const res = await fetch('/api/profile/photo')
        if (res.ok) {
          const j = await res.json() as { foto_perfil_url: string | null }
          setFotoUrl(j.foto_perfil_url ?? null)
        }
      } catch { /* ignorar */ }
      finally { setLoadingFoto(false) }
    }
    void fetchFondos()
    void fetchFoto()
  }, [user])

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { showNotif('Solo se permiten imágenes', 'warning'); return }
    if (file.size > 20 * 1024 * 1024) { showNotif('La imagen no puede superar 20 MB', 'warning'); return }
    if (fotoInputRef.current) fotoInputRef.current.value = ''
    setCropFile(file)
  }

  const handleCropConfirm = async (blob: Blob) => {
    setCropFile(null)
    setUploadingFoto(true)
    try {
      const fd = new FormData()
      fd.append('file', new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
      const res = await fetch('/api/profile/photo', { method: 'POST', body: fd })
      const j = await res.json() as { success: boolean; foto_perfil_url?: string; message?: string }
      if (!res.ok || !j.success) { showNotif(j.message ?? 'Error subiendo foto', 'danger'); return }
      setFotoUrl(j.foto_perfil_url ?? null)
      if (user && j.foto_perfil_url) setUser({ ...user, foto_perfil_url: j.foto_perfil_url })
      showNotif('Foto de perfil actualizada', 'success')
    } catch { showNotif('Error subiendo foto', 'danger') }
    finally { setUploadingFoto(false) }
  }

  const handleEliminarFoto = async () => {
    if (!confirm('¿Eliminar tu foto de perfil?')) return
    try {
      const res = await fetch('/api/profile/photo', { method: 'DELETE' })
      const j = await res.json() as { success: boolean; message?: string }
      if (!res.ok || !j.success) { showNotif(j.message ?? 'Error', 'danger'); return }
      setFotoUrl(null)
      if (user) setUser({ ...user, foto_perfil_url: null })
      showNotif('Foto eliminada', 'success')
    } catch { showNotif('Error eliminando foto', 'danger') }
  }

  if (!user) return null

  return (
    <BasePage title="Fondos para Zoom" alert={notif ? { type: notif.type as 'success'|'danger'|'info'|'warning', message: notif.msg, show: true } : undefined}>
      {/* ---- Tarjeta foto de perfil ---- */}
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-white d-flex align-items-center gap-2">
            <i className="bi bi-person-circle fs-5 text-primary"></i>
            <span className="fw-semibold">Tu foto de perfil</span>
            <span className="text-muted small ms-2">Aparecerá superpuesta en el fondo al descargar</span>
          </div>
          <div className="card-body d-flex align-items-center gap-4 flex-wrap">
            {/* Avatar circular */}
            <div
              style={{
                width: 80, height: 80, borderRadius: '50%', overflow: 'hidden',
                border: '2px solid #dee2e6', background: '#f8f9fa',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {loadingFoto
                ? <div className="spinner-border spinner-border-sm text-secondary" />
                : fotoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={fotoUrl} alt="Tu foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <i className="bi bi-person-fill fs-3 text-secondary"></i>
              }
            </div>

            <div>
              {fotoUrl
                ? (
                  <div>
                    <p className="fw-semibold mb-1">{user.nombre || user.email}</p>
                    <p className="mb-2 small text-muted">Foto cargada. Puedes cambiarla o eliminarla.</p>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => fotoInputRef.current?.click()}
                        disabled={uploadingFoto}
                      >
                        <i className="bi bi-arrow-repeat me-1"></i>Cambiar
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={handleEliminarFoto}
                        disabled={uploadingFoto}
                      >
                        <i className="bi bi-trash3 me-1"></i>Eliminar
                      </button>
                    </div>
                  </div>
                )
                : (
                  <div>
                    <p className="fw-semibold mb-1">{user.nombre || user.email}</p>
                    <p className="mb-2 small text-muted">
                      Sin foto de perfil. Agrega una para que aparezca en la esquina de tus fondos al descargar.
                    </p>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => fotoInputRef.current?.click()}
                      disabled={uploadingFoto}
                    >
                      {uploadingFoto
                        ? <><span className="spinner-border spinner-border-sm me-1" />Subiendo...</>
                        : <><i className="bi bi-upload me-1"></i>Subir foto</>
                      }
                    </button>
                  </div>
                )
              }
            </div>
          </div>
        </div>

        {/* Input oculto de foto */}
        <input
          ref={fotoInputRef}
          type="file"
          accept="image/*"
          className="d-none"
          onChange={handleFotoChange}
        />

        {/* ---- Grid de fondos ---- */}
        <h5 className="mb-3">
          <i className="bi bi-images me-2 text-info"></i>Fondos disponibles
        </h5>

        {loadingFondos && (
          <div className="text-center py-5">
            <div className="spinner-border text-info" />
            <p className="text-muted mt-2">Cargando fondos...</p>
          </div>
        )}

        {!loadingFondos && fondos.length === 0 && (
          <div className="alert alert-light border text-center py-5">
            <i className="bi bi-image fs-1 text-muted d-block mb-3"></i>
            <p className="text-muted mb-0">No hay fondos disponibles por el momento.</p>
            <p className="text-muted small">Los supervisores pueden cargar fondos desde la sección <strong>Parámetros</strong>.</p>
          </div>
        )}

        {!loadingFondos && fondos.length > 0 && (
          <div className="row g-3">
            {fondos.map(f => (
              <div key={f.id} className="col-sm-6 col-md-4 col-xl-3">
                <div className="card h-100 shadow-sm border-0 overflow-hidden">
                  <div className="position-relative" style={{ paddingTop: '56.25%' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.public_url}
                      alt="Fondo Zoom"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {/* Overlay hover */}
                    <div
                      className="position-absolute inset-0 d-flex align-items-center justify-content-center"
                      style={{ top: 0, left: 0, right: 0, bottom: 0 }}
                    />
                  </div>
                  <div className="card-body p-2 d-flex justify-content-between align-items-center">
                    <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                      {new Date(f.created_at).toLocaleDateString('es-MX')}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-info text-white"
                      onClick={() => setFondoModal(f)}
                    >
                      <i className="bi bi-download me-1"></i>Descargar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Modal de descarga */}
      {fondoModal && (
        <DescargarModal
          fondo={fondoModal}
          fotoUrl={fotoUrl}
          userName={user.nombre || user.email || null}
          onClose={() => setFondoModal(null)}
        />
      )}

      {cropFile && (
        <CropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={() => { setCropFile(null); if (fotoInputRef.current) fotoInputRef.current.value = '' }}
        />
      )}
    </BasePage>
  )
}
