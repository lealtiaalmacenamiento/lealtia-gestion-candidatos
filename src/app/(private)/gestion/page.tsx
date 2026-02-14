"use client"
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppModal from '@/components/ui/AppModal'
import { useAuth } from '@/context/AuthProvider'
import { useDialog } from '@/components/ui/DialogProvider'
import { deleteCliente } from '@/lib/api'
import AlertasPagos from '@/components/dashboard/AlertasPagos'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { exportGestionPDF, pngToBase64 } from '@/lib/gestionPdfExport'

type Cliente = {
  id: string
  cliente_code?: string
  primer_nombre?: string|null
  segundo_nombre?: string|null
  primer_apellido?: string|null
  segundo_apellido?: string|null
  email?: string|null
  telefono_celular?: string|null
  fecha_nacimiento?: string|null
  activo?: boolean | null
  inactivado_at?: string | null
}

type Poliza = {
  id: string
  cliente_id: string
  numero_poliza?: string|null
  estatus?: string|null
  forma_pago?: string|null // método cobro (MODO_DIRECTO/CARGO_AUTOMATICO)
  periodicidad_pago?: string|null // A/S/T/M
  prima_input?: number|null
  prima_moneda?: string|null
  sa_input?: number|null
  sa_moneda?: string|null
  producto_nombre?: string|null
  fecha_emision?: string|null
  renovacion?: string|null
  fecha_limite_pago?: string|null
  tipo_producto?: string|null
  fecha_renovacion?: string|null
  dia_pago?: number|null
  meses_check?: Record<string, boolean>|null
  meses_montos?: Record<string, number|null>|null
}

function normalizeDateInput(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const slash = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (slash) {
    const [ , dd, mm, yyyy ] = slash
    const month = mm.padStart(2, '0')
    const day = dd.padStart(2, '0')
    return `${yyyy}-${month}-${day}`
  }
  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10)
  return trimmed
}

function normalizePeriodicidadValue(value?: string | null): string | null {
  if (!value) return null
  const v = value.trim().toUpperCase()
  const map: Record<string, string> = {
    M: 'mensual', MENSUAL: 'mensual', MES: 'mensual',
    T: 'trimestral', TRIMESTRAL: 'trimestral', TRIMESTRE: 'trimestral',
    S: 'semestral', SEMESTRAL: 'semestral', SEMESTRA: 'semestral',
    A: 'anual', ANUAL: 'anual', ANUALIDAD: 'anual'
  }
  return map[v] || value.trim().toLowerCase()
}

function clampDayToMonth(year: number, monthIndexZeroBased: number, day: number): number {
  const last = new Date(Date.UTC(year, monthIndexZeroBased + 1, 0)).getUTCDate()
  return Math.max(1, Math.min(day, last))
}

function dateFromReferenceAndDay(refIso: string, day: number): string | null {
  if (!refIso || !Number.isFinite(day)) return null
  const parsed = Date.parse(refIso)
  if (Number.isNaN(parsed)) return null
  const base = new Date(parsed)
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth()
  const d = clampDayToMonth(y, m, day)
  const month = String(m + 1).padStart(2, '0')
  const dayStr = String(d).padStart(2, '0')
  return `${y}-${month}-${dayStr}`
}

const normalizePolizaDates = (p: Poliza): Poliza => {
  const emision = normalizeDateInput(p.fecha_emision)
  const renovacion = normalizeDateInput(p.fecha_renovacion || p.renovacion)
  const refBase = emision || renovacion || null
  const autoFechaLimite = refBase && Number.isFinite(p.dia_pago) ? dateFromReferenceAndDay(refBase, Number(p.dia_pago)) : null

  return {
    ...p,
    fecha_emision: emision,
    // Usar renovacion calculada como respaldo si la fecha_renovacion viene vacía
    fecha_renovacion: renovacion,
    // Prefill fecha_limite_pago si viene vacía usando día de pago y fecha_emision como ancla
    fecha_limite_pago: normalizeDateInput(p.fecha_limite_pago || autoFechaLimite),
    renovacion
  }
}

export default function GestionPage() {
  const { user } = useAuth()
  const dialog = useDialog()
  const role = (user?.rol || '').toLowerCase()
  const isSuper = ['supervisor','super_usuario','supervisor','admin'].includes(role)
  const agentDisplayName = (user?.nombre && user.nombre.trim()) ? user.nombre.trim() : (user?.email || 'tu asesor')

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [polizas, setPolizas] = useState<Poliza[]>([])
  const [agentes, setAgentes] = useState<Array<{ id:number; id_auth?: string|null; nombre?:string|null; email:string; clientes_count?: number; badges?: { polizas_en_conteo?: number|null; conexion?: string|null; meses_para_graduacion?: number|null; polizas_para_graduacion?: number|null; necesita_mensualmente?: number|null; objetivo?: number|null; comisiones_mxn?: number|null } }>>([])
  const [selfBadges, setSelfBadges] = useState<{ polizas_en_conteo?: number|null; conexion?: string|null; meses_para_graduacion?: number|null; polizas_para_graduacion?: number|null; necesita_mensualmente?: number|null; objetivo?: number|null; comisiones_mxn?: number|null } | null>(null)
  const [expandedAgentes, setExpandedAgentes] = useState<Record<string, boolean>>({})
  const [clientesPorAgente, setClientesPorAgente] = useState<Record<string, Cliente[]>>({})
  const [qClientes, setQClientes] = useState('')
  const [qPolizas, setQPolizas] = useState('')
  // Búsqueda global de clientes (vista super)
  const [qClientesSuper, setQClientesSuper] = useState('')
  const [clientesSuper, setClientesSuper] = useState<Cliente[]>([])
  const [searchingSuper, setSearchingSuper] = useState(false)
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [view, setView] = useState<'list' | 'cliente' | 'polizas'>('list')
  const [loading, setLoading] = useState(false)
  const [deletingClienteId, setDeletingClienteId] = useState<string | null>(null)

  const [editCliente, setEditCliente] = useState<Cliente|null>(null)
  const [editPoliza, setEditPoliza] = useState<Poliza|null>(null)
  const tableMonthKeys = useMemo(() => {
    if (!polizas.length) return generateMonthKeys()
    const set = new Set<string>()
    for (const p of polizas) {
      for (const k of generateMonthKeys(p)) set.add(k)
    }
    return Array.from(set).sort()
  }, [polizas])
    useEffect(() => {
      let abort = false
      const loadPagos = async () => {
        if (!editPoliza?.id) return
        try {
          const res = await fetch(`/api/polizas/${editPoliza.id}/pagos`, { cache: 'no-store' })
          const j = await res.json().catch(()=>({}))
          if (!res.ok || !Array.isArray(j?.pagos)) return
          const meses_check: Record<string, boolean> = {}
          const meses_montos: Record<string, number> = {}
          for (const pago of j.pagos as Array<{ periodo_mes?: string; estado?: string; monto_pagado?: number; monto_programado?: number }>) {
            if (!pago?.periodo_mes) continue
            const d = new Date(pago.periodo_mes)
            if (Number.isNaN(d.valueOf())) continue
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`
            if (pago.estado === 'pagado') {
              meses_check[key] = true
              const monto = typeof pago.monto_pagado === 'number' ? pago.monto_pagado : pago.monto_programado
              if (typeof monto === 'number' && Number.isFinite(monto) && monto >= 0) meses_montos[key] = monto
            }
          }
          if (!abort) {
            setEditPoliza(prev => prev ? { ...prev, meses_check: { ...(prev.meses_check||{}), ...meses_check }, meses_montos: { ...(prev.meses_montos||{}), ...meses_montos } } : prev)
          }
        } catch {}
      }
      loadPagos()
      return () => { abort = true }
    }, [editPoliza?.id])
  // Edición cómoda de prima: mantener texto crudo para evitar saltos del cursor por formateo
  const [editPrimaText, setEditPrimaText] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [submittingNuevoCliente, setSubmittingNuevoCliente] = useState(false)
  const [nuevo, setNuevo] = useState<Cliente & { telefono_celular?: string|null, fecha_nacimiento?: string|null }>({ id: '', telefono_celular: '', fecha_nacimiento: null })
  const [nuevoAgenteId, setNuevoAgenteId] = useState<string>('')
  // Modal de mover cliente a otro agente
  const [movingCliente, setMovingCliente] = useState<Cliente | null>(null)
  const [targetAgenteId, setTargetAgenteId] = useState<string>('')
  const [submittingMove, setSubmittingMove] = useState(false)
  // creación de póliza deshabilitada temporalmente
  const [addingPoliza, setAddingPoliza] = useState(false)
  const [submittingNuevaPoliza, setSubmittingNuevaPoliza] = useState(false)
  const [productos, setProductos] = useState<Array<{ id: string; nombre_comercial: string; tipo_producto: string; moneda?: string|null; sa_min?: number|null; sa_max?: number|null }>>([])
  const [tipoProducto, setTipoProducto] = useState<string>('')
  const [nuevaPoliza, setNuevaPoliza] = useState<{ numero_poliza: string; fecha_emision: string; fecha_renovacion: string; fecha_limite_pago: string; estatus: string; forma_pago: string; periodicidad_pago?: string; dia_pago: string; prima_input: string; prima_moneda: string; producto_parametro_id?: string; meses_check: Record<string, boolean> }>({ numero_poliza: '', fecha_emision: '', fecha_renovacion: '', fecha_limite_pago: '', estatus: 'EN_VIGOR', forma_pago: '', periodicidad_pago: undefined, dia_pago: '', prima_input: '', prima_moneda: 'MXN', meses_check: {} })
  const [savingPoliza, setSavingPoliza] = useState<boolean>(false)
  const [savingMeta, setSavingMeta] = useState(false)
  // Meta header inputs
  const [metaSelf, setMetaSelf] = useState<{ objetivo: string }>({ objetivo: '' })

  useEffect(() => {
    if (!addingPoliza) return
    ;(async()=>{
      try {
        const r = await fetch('/api/producto_parametros?debug=1', { cache: 'no-store' })
        const j = await r.json()
        if (r.ok && Array.isArray(j)) setProductos(j)
      } catch {}
    })()
  }, [addingPoliza])

  // Función para abrir modal de edición de póliza desde alertas
  const handleEditPolizaFromAlerta = useCallback(async (polizaId: string) => {
    try {
      setLoading(true)
      // Obtener la póliza completa
      const res = await fetch(`/api/polizas?include_clientes_inactivos=1`, { cache: 'no-store' })
      const json = await res.json()
      if (res.ok && Array.isArray(json.items)) {
        const poliza = json.items.find((p: Poliza) => p.id === polizaId)
        if (poliza) {
          const normalized = normalizePolizaDates(poliza)
          setEditPoliza(normalized)
          setEditPrimaText(String(normalized.prima_input || ''))
        }
      }
    } catch (error) {
      console.error('Error cargando póliza:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (isSuper) {
        const ra = await fetch('/api/agentes', { cache: 'no-store' })
        const ja = await ra.json()
        if (Array.isArray(ja)) setAgentes(ja)
        // Prefill own meta for super (in case super is also agent)
        try {
          const rm = await fetch('/api/agentes/meta', { cache: 'no-store' })
          if (rm.ok) {
            const m = await rm.json()
            setMetaSelf({ objetivo: ((m?.objetivo ?? 36)).toString() })
          }
        } catch {}
      } else {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  const urlClientes = new URL('/api/clientes', origin)
  if (qClientes.trim()) urlClientes.searchParams.set('q', qClientes.trim())
  urlClientes.searchParams.set('include_inactivos', '1')
  const rc = await fetch(urlClientes.toString())
        const jc = await rc.json()
        setClientes(jc.items || [])
        // cargar meta propia (objetivo)
        try {
          const rm = await fetch('/api/agentes/meta', { cache: 'no-store' })
          if (rm.ok) {
            const m = await rm.json()
            setMetaSelf({ objetivo: ((m?.objetivo ?? 36)).toString() })
          }
        } catch {}
        // cargar badges propios
        try {
          const ra = await fetch('/api/agentes', { cache: 'no-store' })
          const ja = await ra.json()
          if (Array.isArray(ja) && ja[0]?.badges) setSelfBadges(ja[0].badges)
        } catch {}
      }
    } finally { setLoading(false) }
  }, [qClientes, isSuper])

  useEffect(() => { void load() }, [load])

  const exportarPDFReporte = useCallback(async () => {
    if (!isSuper) return
    
    try {
      // Obtener datos del reporte
      const res = await fetch('/api/reportes/gestion', { cache: 'no-store' })
      const json = await res.json()
      
      if (!res.ok) {
        await dialog.alert(json.error || 'Error al obtener datos del reporte')
        return
      }
      
      // Cargar logo
      let logoBase64: string | undefined
      try {
        logoBase64 = await pngToBase64('/Logolealtiaruedablanca.png')
      } catch {
        console.warn('No se pudo cargar el logo')
      }
      
      // Crear PDF
      const doc = new jsPDF()
      await exportGestionPDF(doc, json.data, autoTable, {
        titulo: 'Reporte General de Clientes y Pólizas',
        logo: logoBase64,
        logoW: 32,
        logoH: 32
      })
      
      // Descargar
      doc.save('Reporte de comisiones General.pdf')
      
    } catch (error) {
      console.error('Error al exportar PDF:', error)
      await dialog.alert('Error al generar el reporte PDF')
    }
  }, [isSuper, dialog])

  const exportarPDFReporteAgente = useCallback(async (agenteId: string, agenteNombre: string) => {
    if (!isSuper) return
    
    try {
      // Obtener datos del reporte para el agente específico
      const res = await fetch(`/api/reportes/gestion?asesor_id=${encodeURIComponent(agenteId)}`, { cache: 'no-store' })
      const json = await res.json()
      
      if (!res.ok) {
        await dialog.alert(json.error || 'Error al obtener datos del reporte')
        return
      }
      
      // Cargar logo
      let logoBase64: string | undefined
      try {
        logoBase64 = await pngToBase64('/Logolealtiaruedablanca.png')
      } catch {
        console.warn('No se pudo cargar el logo')
      }
      
      // Crear PDF
      const doc = new jsPDF()
      await exportGestionPDF(doc, json.data, autoTable, {
        titulo: `Reporte de Comisiones - ${agenteNombre}`,
        logo: logoBase64,
        logoW: 32,
        logoH: 32
      })
      
      // Descargar
      const nombreArchivo = `Reporte de comisiones ${agenteNombre.replace(/\s+/g, '_')}.pdf`
      doc.save(nombreArchivo)
      
    } catch (error) {
      console.error('Error al exportar PDF:', error)
      await dialog.alert('Error al generar el reporte PDF')
    }
  }, [isSuper, dialog])

  const searchClientesSuper = useCallback(async () => {
    if (!isSuper) return
    const q = qClientesSuper.trim()
    if (!q) { setClientesSuper([]); return }
    setSearchingSuper(true)
    try {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  const superUrl = new URL('/api/clientes', origin)
  superUrl.searchParams.set('q', q)
  superUrl.searchParams.set('include_inactivos', '1')
  const r = await fetch(superUrl.toString(), { cache: 'no-store' })
      const j = await r.json().catch(()=>({}))
      setClientesSuper(j.items || [])
    } finally { setSearchingSuper(false) }
  }, [qClientesSuper, isSuper])

  // Auto-buscar clientes (super) con debounce al escribir
  useEffect(() => {
    if (!isSuper) return
    const q = qClientesSuper.trim()
    // Limpia resultados si vacío
    if (!q) { setClientesSuper([]); return }
    const t = setTimeout(() => { void searchClientesSuper() }, 400)
    return () => clearTimeout(t)
  }, [qClientesSuper, isSuper, searchClientesSuper])

  // Sincronizar texto de prima SOLAMENTE cuando se cambia de póliza (por id),
  // no en cada tecleo del usuario (cuando solo cambia prima_input).
  const prevEditPolizaId = useRef<string|undefined>(undefined)
  useEffect(() => {
    const currentId = editPoliza?.id
    if (prevEditPolizaId.current !== currentId) {
      prevEditPolizaId.current = currentId
      if (!editPoliza) { setEditPrimaText(''); return }
      const v = editPoliza.prima_input
      if (typeof v === 'number' && isFinite(v)) setEditPrimaText(v.toFixed(2))
      else setEditPrimaText('')
    }
  }, [editPoliza])

  // Helper para abrir vista de pólizas y cargar con query actual
  const openPolizas = useCallback(async (c: Cliente) => {
    setSelectedCliente(c)
    setView('polizas')
    setLoading(true)
    try {
      const url = new URL('/api/polizas', window.location.origin)
      url.searchParams.set('cliente_id', c.id)
      if (qPolizas.trim()) url.searchParams.set('q', qPolizas.trim())
      const rp = await fetch(url.toString(), { cache: 'no-store' })
      const jp = await rp.json().catch(()=>({}))
      let items: Poliza[] = Array.isArray(jp.items) ? (jp.items as Poliza[]) : []
      const q = qPolizas.trim().toLowerCase()
      // Fallback: si el servidor devolvió vacío con q, intentar traer sin q y filtrar en cliente
      if (q && (!Array.isArray(items) || items.length === 0)) {
        try {
          const url2 = new URL('/api/polizas', window.location.origin)
          url2.searchParams.set('cliente_id', c.id)
          const rp2 = await fetch(url2.toString(), { cache: 'no-store' })
          const jp2 = await rp2.json().catch(()=>({}))
          const all: Poliza[] = Array.isArray(jp2.items) ? (jp2.items as Poliza[]) : []
          items = all.filter((p: Poliza) => {
            const num = (p?.numero_poliza || '').toString().toLowerCase()
            const prod = (p?.producto_nombre || '').toString().toLowerCase()
            return num.includes(q) || prod.includes(q)
          })
        } catch {}
      }
      setPolizas(items.map(normalizePolizaDates))
    } finally { setLoading(false) }
  }, [qPolizas])

  // Auto-buscar pólizas con debounce cuando hay cliente seleccionado y vista 'polizas'
  useEffect(() => {
    if (view !== 'polizas' || !selectedCliente) return
    const q = qPolizas.trim()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const url = new URL('/api/polizas', window.location.origin)
        url.searchParams.set('cliente_id', selectedCliente.id)
        if (q) url.searchParams.set('q', q)
        const rp = await fetch(url.toString(), { cache: 'no-store' })
        const jp = await rp.json().catch(()=>({}))
        let items: Poliza[] = Array.isArray(jp.items) ? (jp.items as Poliza[]) : []
        // Fallback client-side si vacío con q
        if (q && (!Array.isArray(items) || items.length === 0)) {
          try {
            const url2 = new URL('/api/polizas', window.location.origin)
            url2.searchParams.set('cliente_id', selectedCliente.id)
            const rp2 = await fetch(url2.toString(), { cache: 'no-store' })
            const jp2 = await rp2.json().catch(()=>({}))
            const all: Poliza[] = Array.isArray(jp2.items) ? (jp2.items as Poliza[]) : []
            const ql = q.toLowerCase()
            items = all.filter((p: Poliza) => {
              const num = (p?.numero_poliza || '').toString().toLowerCase()
              const prod = (p?.producto_nombre || '').toString().toLowerCase()
              return num.includes(ql) || prod.includes(ql)
            })
          } catch {}
        }
        setPolizas(items.map(normalizePolizaDates))
      } finally { setLoading(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [qPolizas, view, selectedCliente])

  // Vista unificada: se elimina redirección a /asesor para que agentes usen esta página directamente

  // Cargar productos parametrizados al abrir el modal de nueva póliza
  // efecto de carga de productos removido

  async function submitClienteCambio(c: Cliente) {
    // Construir payload mínimo desde el formulario
    const payload: Record<string, unknown> = {
      primer_nombre: c.primer_nombre ?? undefined,
      segundo_nombre: c.segundo_nombre ?? undefined,
      primer_apellido: c.primer_apellido ?? undefined,
      segundo_apellido: c.segundo_apellido ?? undefined,
      telefono_celular: c.telefono_celular ?? undefined,
      correo: c.email ?? undefined,
  fecha_nacimiento: c.fecha_nacimiento ?? undefined,
    }
    const res = await fetch('/api/clientes/updates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: c.id, payload })
    })
    const j = await res.json()
    if (!res.ok) { await dialog.alert(j.error || 'Error al enviar solicitud'); return }
    if (isSuper && j.id) {
      const ra = await fetch('/api/clientes/updates/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: j.id }) })
      const ja = await ra.json().catch(()=>({}))
      if (!ra.ok) { await dialog.alert(ja.error || 'Error al aprobar'); return }
      await dialog.alert('Guardado y aprobado')
    } else {
      await dialog.alert('Solicitud enviada')
    }
    setEditCliente(null)
  }

  async function submitPolizaCambio(p: Poliza) {
    if (savingPoliza) return
    setSavingPoliza(true)
    
    // Detectar cambio de periodicidad
    const polizaOriginal = polizas.find(pol => pol.id === p.id)
    const periodicidadOriginal = polizaOriginal?.periodicidad_pago
    const periodicidadNueva = normalizePeriodicidadValue(p.periodicidad_pago)
    
    if (periodicidadOriginal && periodicidadNueva && periodicidadOriginal !== periodicidadNueva) {
      const confirmar = await dialog.confirm(
        `¿Estás seguro de cambiar la periodicidad de "${periodicidadOriginal}" a "${periodicidadNueva}"?\n\n` +
        `ADVERTENCIA: Esto eliminará todos los pagos existentes (incluso los pagados) y regenerará el calendario de pagos según la nueva periodicidad.\n\n` +
        `Deberás volver a registrar los pagos realizados después de este cambio.`
      )
      if (!confirmar) {
        setSavingPoliza(false)
        return
      }
    }
    
    // Guardar una referencia del estado esperado para verificación post-guardar
    const expectedId = p.id
    const expectedPrima = typeof p.prima_input === 'number' ? Number(p.prima_input.toFixed(2)) : null
    const periodicidadNormalizada = normalizePeriodicidadValue(p.periodicidad_pago)
    if (!p.fecha_limite_pago || !p.fecha_limite_pago.trim()) {
      await dialog.alert('Fecha límite de pago es requerida')
      setSavingPoliza(false)
      return
    }
    const allowedKeys = new Set(generateMonthKeys(p))
    const filteredCheckEntries = Object.entries(p.meses_check || {}).filter(([k, v]) => allowedKeys.has(k) && !!v)
    const filteredMontosEntries = Object.entries(p.meses_montos || {}).filter(([k]) => allowedKeys.has(k))

    const missingMonto = filteredCheckEntries.some(([m]) => {
      const val = (p.meses_montos || {})[m]
      return val === undefined || val === null || !Number.isFinite(val) || val < 0
    })
    if (missingMonto) {
      await dialog.alert('Debes capturar el monto pagado para cada mes marcado como pagado')
      setSavingPoliza(false)
      return
    }
    const payload: Record<string, unknown> = {
      numero_poliza: emptyAsUndef(p.numero_poliza),
      estatus: emptyAsUndef(p.estatus),
      forma_pago: emptyAsUndef(p.forma_pago),
      fecha_emision: emptyAsUndef(p.fecha_emision),
      fecha_renovacion: emptyAsUndef(p.fecha_renovacion),
      fecha_limite_pago: emptyAsUndef(p.fecha_limite_pago),
      periodicidad_pago: emptyAsUndef(periodicidadNormalizada),
      dia_pago: p.dia_pago ?? undefined,
      prima_input: p.prima_input ?? undefined,
      prima_moneda: emptyAsUndef(p.prima_moneda),
      meses_check: Object.fromEntries(filteredCheckEntries),
      meses_montos: Object.fromEntries(filteredMontosEntries),
    }
    try {
      const res = await fetch('/api/polizas/updates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poliza_id: p.id, payload })
      })
      const j = await res.json().catch(()=>({}))
      if (!res.ok) { await dialog.alert(j.error || 'Error al enviar solicitud'); return }
      if (isSuper && j.id) {
        const ra = await fetch('/api/polizas/updates/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: j.id, debug: true }) })
        const ja = await ra.json().catch(()=>({}))
        if (!ra.ok) {
          const details = typeof ja === 'object' ? (ja.error || ja.details || ja.hint || ja.code) : null
          await dialog.alert(`Error al aprobar${details ? `: ${details}` : ''}`)
          return
        }
        // Usar la respuesta para validar que la prima persistió y reflejar en UI al instante
        const approvedPrima = (typeof ja?.poliza?.prima_input === 'number') ? Number(ja.poliza.prima_input.toFixed(2)) : null
        if (ja?.poliza?.id && typeof ja?.poliza?.id === 'string') {
          // Optimistic update inmediata en la lista actual (si visible)
          setPolizas(prev => prev.map(it => it.id === ja.poliza.id ? { ...it, prima_input: (typeof ja.poliza.prima_input === 'number' ? ja.poliza.prima_input : it.prima_input), prima_moneda: (typeof ja.poliza.prima_moneda === 'string' ? ja.poliza.prima_moneda : it.prima_moneda) } : it))
        }
        if (expectedPrima != null && approvedPrima != null && approvedPrima !== expectedPrima) {
          await dialog.alert(`Aviso: el backend no reflejó el cambio de prima. Valor actual: ${approvedPrima} (esperado ${expectedPrima}). Revisa permisos o validaciones.`)
        } else {
          await dialog.alert('Guardado y aprobado')
        }
        // Regenerar calendario de pagos si se aprobó como super para reflejar periodicidad/día/meses
        if (p.id) {
          try {
            await fetch(`/api/polizas/${p.id}/pagos/generar`, { method: 'POST' })
          } catch (err) {
            console.error('No se pudo regenerar pagos', err)
          }
        }
      } else if (!isSuper) {
        await dialog.alert('Solicitud enviada')
      }

      // Refrescar datos para reflejar el recálculo en UI (sólo si se aprobó o si queremos reflejar último estado)
      try {
        if (selectedCliente?.id) {
          const url = new URL('/api/polizas', window.location.origin)
          url.searchParams.set('cliente_id', selectedCliente.id)
          const rp = await fetch(url.toString(), { cache: 'no-store' })
          const jp = await rp.json().catch(()=>({}))
          if (Array.isArray(jp.items)) {
            setPolizas((jp.items || []).map(normalizePolizaDates))
            // Verificación: si se aprobó como super, confirmar que la prima persistió
            if (isSuper && expectedId) {
              const updated = (jp.items as Array<{ id: string; prima_input?: number | null }>).find((it) => it.id === expectedId)
              const backendPrima = typeof updated?.prima_input === 'number' ? Number(updated.prima_input.toFixed(2)) : null
              if (expectedPrima != null && backendPrima != null && backendPrima !== expectedPrima) {
                await dialog.alert(`Aviso: el backend no reflejó el cambio de prima. Valor actual: ${backendPrima} (esperado ${expectedPrima}). Revisa permisos o validaciones.`)
              }
            }
          }
        }
        try {
          const ra = await fetch('/api/agentes', { cache: 'no-store' })
          const ja = await ra.json().catch(()=>[])
          if (isSuper) {
            if (Array.isArray(ja)) setAgentes(ja)
          } else {
            if (Array.isArray(ja) && ja[0]?.badges) setSelfBadges(ja[0].badges)
          }
        } catch {}
      } finally {
        setEditPoliza(null)
      }
    } finally {
      setSavingPoliza(false)
    }
  }

  // Parser robusto para montos con separadores de miles y decimal en diferentes formatos
  function parseMoneyInput(text: string): number | null {
    if (!text) return null
    const s0 = text.trim()
    if (!s0) return null
    // Mantener sign negativo si aplica
    const sign = s0.startsWith('-') ? -1 : 1
    const s = sign === -1 ? s0.slice(1) : s0
    // Si no hay separadores, intenta parsear directo
    if (!/[.,]/.test(s)) {
      const n = Number(s.replace(/\s+/g, ''))
      return Number.isFinite(n) ? sign * n : null
    }
    // Determinar último separador como decimal
    const lastDot = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    const lastSep = Math.max(lastDot, lastComma)
    const decSep = lastSep >= 0 ? s.charAt(lastSep) : null
    if (!decSep) {
      const n = Number(s.replace(/[^0-9-]/g, ''))
      return Number.isFinite(n) ? sign * n : null
    }
    const otherSep = decSep === ',' ? '.' : ','
    // Quitar todos los separadores distintos al decimal
    const noOther = s.replace(new RegExp(`\\${otherSep}`, 'g'), '')
    // Dividir por el separador decimal (puede aparecer múltiples veces). Usar la última como decimal
    const parts = noOther.split(decSep)
    if (parts.length === 1) {
      const n = Number(parts[0].replace(/[^0-9]/g, ''))
      return Number.isFinite(n) ? sign * n : null
    }
    const decimalPart = parts.pop() || ''
    const intPart = parts.join('')
    const assembled = `${intPart}.${decimalPart}`
    const n = Number(assembled)
    return Number.isFinite(n) ? sign * n : null
  }

  return (
    <div className="p-4">
      <div className="d-flex align-items-center mb-4 gap-2">
        <h1 className="text-xl font-semibold mb-0">Clientes y Pólizas</h1>
      </div>
      {loading && <p className="text-sm text-gray-600">Cargando…</p>}
      {view === 'list' && (
        <section className="border rounded p-3">
          {isSuper ? (
            <>
              {/* Widget de Alertas de Pagos */}
              <div className="row mb-4">
                <div className="col-lg-8">
                  <AlertasPagos onEditPoliza={handleEditPolizaFromAlerta} />
                </div>
              </div>

              <header className="flex items-center gap-2 mb-3 flex-wrap">
                <h2 className="font-medium">Agentes</h2>
                <div className="d-flex align-items-end gap-2 ms-auto flex-wrap">
                  {/* Buscador global de clientes (supervisor) */}
                  <div className="d-flex flex-column" style={{width: 260}}>
                    <label className="form-label small mb-1">Buscar clientes</label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Nombre o correo"
                      value={qClientesSuper}
                      onChange={e=> setQClientesSuper(e.target.value)}
                      onKeyDown={e=>{ if (e.key === 'Enter') { void searchClientesSuper() } }}
                    />
                  </div>
                  {/* Meta rápida también para super si es agente */}
                  {user && agentes.some(a=>a.id===user.id) && (
                    <>
                      <div className="d-flex flex-column" style={{width:140}}>
                        <label className="form-label small mb-1">Objetivo</label>
                        <input className="form-control form-control-sm" type="number" value={metaSelf.objetivo} onChange={e=> setMetaSelf({ ...metaSelf, objetivo: e.target.value })} />
                      </div>
                      <button className="btn btn-sm btn-success" disabled={savingMeta} onClick={async()=>{
                        try {
                          setSavingMeta(true)
                          const body: { objetivo: number | null } = {
                            objetivo: metaSelf.objetivo ? Number(metaSelf.objetivo) : null
                          }
                          const r=await fetch('/api/agentes/meta',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
                          const j=await r.json(); if (!r.ok) { await dialog.alert(j.error || 'Error al guardar objetivo'); return }
                          await load()
                        } finally { setSavingMeta(false) }
                      }}>Guardar objetivo</button>
                    </>
                  )}
                  <button className="px-3 py-1 text-sm bg-gray-100 border rounded" onClick={()=> window.location.reload()}>Refrescar</button>
                  {/* Botón de exportar PDF (solo supervisores) */}
                  <button 
                    className="px-3 py-1 text-sm btn btn-info" 
                    onClick={exportarPDFReporte}
                    title="Descargar reporte general en PDF"
                  >
                    <i className="bi bi-file-earmark-pdf me-1"></i>
                    Exportar PDF
                  </button>
                  {/* Total comisiones (supervisor) */}
                  {agentes.length > 0 && (
                    <span className="badge text-bg-primary">
                      Total comisiones: {
                        (()=>{
                          try {
                            const total = agentes.reduce((acc, a)=> acc + (a.badges?.comisiones_mxn || 0), 0)
                            return (total).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
                          } catch { return 'MXN $0.00' }
                        })()
                      }
                    </span>
                  )}
                  <button className="px-3 py-1 text-sm btn btn-primary" onClick={()=>{ setCreating(true); setNuevo({ id: '', telefono_celular: '' }) }}>Nuevo cliente</button>
                </div>
              </header>
              {(qClientesSuper.trim() || searchingSuper || clientesSuper.length>0) && (
                <div className="border rounded p-2 mb-3">
                  <div className="d-flex align-items-center mb-2">
                    <h3 className="h6 mb-0">Resultados de clientes</h3>
                    {searchingSuper && <span className="small text-muted ms-2">Buscando…</span>}
                  </div>
                  <div className="table-responsive small">
                    <table className="table table-sm table-striped align-middle">
                      <thead>
                        <tr>
                          <th>Número de cliente</th>
                          <th>Contratante</th>
                          <th>Estado</th>
                          <th>Teléfono</th>
                          <th>Correo</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientesSuper.map(c => (
                          <tr key={c.id} className={c.activo === false ? 'table-secondary' : undefined}>
                            <td className="font-mono text-xs">{c.cliente_code || c.id}</td>
                            <td className="text-xs">{fmtNombre(c)}</td>
                            <td className="text-xs">{renderEstadoBadge(c)}</td>
                            <td className="text-xs">{c.telefono_celular ? (<a href={buildWhatsAppLink(c.telefono_celular, agentDisplayName)} target="_blank" rel="noopener noreferrer">{c.telefono_celular}</a>) : '—'}</td>
                            <td className="text-xs">{c.email ? (<a href={`mailto:${c.email}`}>{c.email}</a>) : '—'}</td>
                            <td className="text-end">
                              <div className="d-flex gap-2 justify-content-end">
                                <button className="btn btn-sm btn-outline-secondary" disabled={loading} onClick={()=>{ void openPolizas(c) }}>Ver pólizas</button>
                                <button className="btn btn-sm btn-primary" onClick={()=>setEditCliente({...c})}>Editar</button>
                                {isSuper && (
                                  <button className="btn btn-sm btn-warning" onClick={()=>{ setMovingCliente(c); setTargetAgenteId('') }}>
                                    <i className="bi bi-arrow-left-right me-1"></i>Mover
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!clientesSuper.length && !searchingSuper && (
                          <tr><td colSpan={6} className="text-center text-muted py-3">Sin resultados</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="accordion" id="agentesAccordion">
                {agentes.map(ag => {
                  const key = ag.id_auth || String(ag.id)
                  const expanded = !!expandedAgentes[key]
                  return (
                    <div key={key} className="accordion-item mb-2">
                      <h2 className="accordion-header">
                        <button
                          className={`accordion-button ${expanded ? '' : 'collapsed'}`}
                          type="button"
                          onClick={async()=>{
                            setExpandedAgentes(prev=>({ ...prev, [key]: !expanded }))
                            if (!expanded && !clientesPorAgente[key]) {
                              try {
                                // Preferir id_auth; si no existe, enviar usuario_id para que el API resuelva id_auth
                                const urlBase = ag.id_auth
                                  ? `/api/clientes/by-asesor?asesor_id=${encodeURIComponent(ag.id_auth)}`
                                  : `/api/clientes/by-asesor?usuario_id=${encodeURIComponent(String(ag.id))}`
                                const rc = await fetch(`${urlBase}&include_inactivos=1`, { cache: 'no-store' })
                                const jc = await rc.json().catch(()=>({ error: 'parse' }))
                                if (!rc.ok) {
                                  console.error('Error cargando clientes por asesor', jc)
                                  await dialog.alert(jc?.error || 'Error al cargar clientes del asesor')
                                  return
                                }
                                setClientesPorAgente(prev=>({ ...prev, [key]: jc.items || [] }))
                              } catch (e) {
                                console.error(e)
                                await dialog.alert('Error al cargar clientes del asesor')
                              }
                            }
                          }}
                        >
                          <div className="d-flex w-100 justify-content-between gap-2 align-items-center">
                            <div className="me-2">
                              <div className="fw-semibold">{ag.nombre || ag.email}</div>
                              <div className="small text-muted">{ag.email}</div>
                            </div>
                            <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
                              <span className="badge bg-secondary">{(clientesPorAgente[key]?.length) ?? (ag.clientes_count || 0)} clientes</span>
                              {ag.badges?.polizas_en_conteo!=null && <span className="badge bg-info text-dark">Pólizas en conteo: {ag.badges.polizas_en_conteo}</span>}
                              {ag.badges?.conexion && <span className="badge bg-light text-dark border">Conexión: {ag.badges.conexion}</span>}
                              {ag.badges?.meses_para_graduacion!=null && <span className="badge bg-warning text-dark">Meses para graduación: {ag.badges.meses_para_graduacion}</span>}
                              {ag.badges?.polizas_para_graduacion!=null && <span className="badge bg-primary">Pólizas para graduación: {ag.badges.polizas_para_graduacion}</span>}
                              {ag.badges?.necesita_mensualmente!=null && <span className="badge bg-success">Necesita mens.: {ag.badges.necesita_mensualmente}</span>}
                              {ag.badges?.objetivo!=null && <span className="badge bg-dark">Objetivo: {ag.badges.objetivo}</span>}
                              {typeof ag.badges?.comisiones_mxn === 'number' && (
                                <span className="badge text-bg-primary">
                                  Comisión: {(()=>{ try { return (ag.badges!.comisiones_mxn || 0).toLocaleString('es-MX', { style:'currency', currency:'MXN' }) } catch { return 'MXN $0.00' } })()}
                                </span>
                              )}
                              {/* Botón exportar PDF por agente */}
                              <span 
                                className="btn btn-sm btn-outline-info"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void exportarPDFReporteAgente(ag.id_auth || String(ag.id), ag.nombre || ag.email)
                                }}
                                title="Descargar reporte de comisiones del agente"
                                role="button"
                                style={{ cursor: 'pointer' }}
                              >
                                <i className="bi bi-file-earmark-pdf me-1"></i>
                                PDF
                              </span>
                              {/* Botón 'Editar meta' removido intencionalmente */}
                            </div>
                          </div>
                        </button>
                      </h2>
                      {expanded && (
                        <div className="accordion-body p-2" style={{ background: '#f8fafc' }}>
                          <div className="table-responsive small">
                            <table className="table table-sm table-striped align-middle mb-0">
                              <thead>
                                <tr>
                                  <th>Número de cliente</th>
                                  <th>Contratante</th>
                                  <th>Estado</th>
                                  <th>Teléfono</th>
                                  <th>Correo</th>
                                  <th>Cumpleaños</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {(clientesPorAgente[key] || []).map(c => (
                                  <tr key={c.id} className={c.activo === false ? 'table-secondary' : undefined}>
                                    <td className="font-mono text-xs">{c.cliente_code || c.id}</td>
                                    <td className="text-xs">{fmtNombre(c)}</td>
                                    <td className="text-xs">{renderEstadoBadge(c)}</td>
                                    <td className="text-xs">
                                      {c.telefono_celular ? (
                                        <a
                                          href={buildWhatsAppLink(c.telefono_celular, ag.nombre || ag.email || agentDisplayName)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          {c.telefono_celular}
                                        </a>
                                      ) : '—'}
                                    </td>
                                    <td className="text-xs">
                                      {c.email ? (
                                        <a href={`mailto:${c.email}`}>{c.email}</a>
                                      ) : '—'}
                                    </td>
                                    <td className="text-xs">{c.fecha_nacimiento ? new Date(c.fecha_nacimiento).toLocaleDateString() : '—'}</td>
                                    <td className="text-end">
                                      <div className="d-flex gap-2 justify-content-end">
                                        <button className="btn btn-sm btn-outline-secondary" disabled={loading} onClick={()=>{ void openPolizas(c) }}>Ver pólizas</button>
                                        <button className="btn btn-sm btn-primary" onClick={()=>setEditCliente({...c})}>Editar</button>
                                        {isSuper && (
                                          <button className="btn btn-sm btn-warning" onClick={()=>{ setMovingCliente(c); setTargetAgenteId('') }}>
                                            <i className="bi bi-arrow-left-right me-1"></i>Mover
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {!((clientesPorAgente[key] || []).length) && <tr><td colSpan={7} className="text-center text-muted py-3">Sin clientes</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {!agentes.length && <div className="text-center text-muted small">Sin agentes</div>}
              </div>
            </>
          ) : (
            <>
              {/* Widget de Alertas de Pagos */}
              <div className="row mb-4">
                <div className="col-lg-8">
                  <AlertasPagos onEditPoliza={handleEditPolizaFromAlerta} />
                </div>
              </div>

              <header className="flex items-center gap-2 mb-3 flex-wrap">
                <h2 className="font-medium">Clientes</h2>
                <div className="d-flex ms-auto align-items-end gap-2 flex-wrap">
                  <input className="border px-2 py-1 text-sm" placeholder="Buscar…" value={qClientes} onChange={e=>setQClientes(e.target.value)} />
                  <button className="px-3 py-1 text-sm bg-gray-100 border rounded" onClick={()=>load()}>Buscar</button>
                  {/* Meta rápida del asesor */}
                  <div className="d-flex flex-column" style={{width:140}}>
                    <label className="form-label small mb-1">Objetivo</label>
                    <input className="form-control form-control-sm" type="number" value={metaSelf.objetivo} onChange={e=> setMetaSelf({ ...metaSelf, objetivo: e.target.value })} />
                  </div>
                  <button className="btn btn-sm btn-success" disabled={savingMeta} onClick={async()=>{
                    try {
                      setSavingMeta(true)
                      const body: { objetivo: number | null } = {
                        objetivo: metaSelf.objetivo ? Number(metaSelf.objetivo) : null
                      }
                      const r=await fetch('/api/agentes/meta',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
                      const j=await r.json(); if (!r.ok) { await dialog.alert(j.error || 'Error al guardar objetivo'); return }
                      await load()
                    } finally { setSavingMeta(false) }
                  }}>Guardar objetivo</button>
                  {/* Badges del asesor */}
                  {selfBadges && (
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      {selfBadges.polizas_en_conteo!=null && <span className="badge bg-info text-dark">Pólizas en conteo: {selfBadges.polizas_en_conteo}</span>}
                      {selfBadges.conexion && <span className="badge bg-light text-dark border">Conexión: {selfBadges.conexion}</span>}
                      {selfBadges.meses_para_graduacion!=null && <span className="badge bg-warning text-dark">Meses para graduación: {selfBadges.meses_para_graduacion}</span>}
                      {selfBadges.polizas_para_graduacion!=null && <span className="badge bg-primary">Pólizas para graduación: {selfBadges.polizas_para_graduacion}</span>}
                      {selfBadges.necesita_mensualmente!=null && <span className="badge bg-success">Necesita mens.: {selfBadges.necesita_mensualmente}</span>}
                      {selfBadges.objetivo!=null && <span className="badge bg-dark">Objetivo: {selfBadges.objetivo}</span>}
                    </div>
                  )}
                  <button className="px-3 py-1 text-sm btn btn-primary" onClick={()=>{ setCreating(true); setNuevo({ id: '', telefono_celular: '' }) }}>Nuevo cliente</button>
                </div>
              </header>
              <div className="table-responsive small">
                <table className="table table-sm table-striped align-middle">
                  <thead>
                    <tr>
                      <th>Número de cliente</th>
                      <th>Contratante</th>
                      <th>Estado</th>
                      <th>Teléfono</th>
                      <th>Correo</th>
                      <th>Cumpleaños</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map(c => (
                      <tr key={c.id} className={c.activo === false ? 'table-secondary' : undefined}>
                        <td className="font-mono text-xs">{c.cliente_code || c.id}</td>
                        <td className="text-xs">{fmtNombre(c)}</td>
                        <td className="text-xs">{renderEstadoBadge(c)}</td>
                        <td className="text-xs">
                          {c.telefono_celular ? (
                            <a
                              href={buildWhatsAppLink(c.telefono_celular, agentDisplayName)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {c.telefono_celular}
                            </a>
                          ) : '—'}
                        </td>
                        <td className="text-xs">
                          {c.email ? (
                            <a href={`mailto:${c.email}`}>{c.email}</a>
                          ) : '—'}
                        </td>
                        <td className="text-xs">{c.fecha_nacimiento ? new Date(c.fecha_nacimiento).toLocaleDateString() : '—'}</td>
                        <td className="text-end">
                          <div className="d-flex gap-2 justify-content-end">
                            <button className="btn btn-sm btn-outline-secondary" disabled={loading} onClick={()=>{ void openPolizas(c) }}>Ver pólizas</button>
                            <button className="btn btn-sm btn-primary" onClick={()=>setEditCliente({...c})}>Editar</button>
                            {isSuper && (
                              <button className="btn btn-sm btn-warning" onClick={()=>{ setMovingCliente(c); setTargetAgenteId('') }}>
                                <i className="bi bi-arrow-left-right me-1"></i>Mover
                              </button>
                            )}
                            <button
                              className="btn btn-sm btn-outline-danger"
                              disabled={deletingClienteId === c.id || c.activo === false}
                              onClick={async () => {
                                if (deletingClienteId || c.activo === false) return
                                const confirmado = await dialog.confirm(
                                  '¿Seguro que deseas inactivar este cliente? Solo es posible si no tiene pólizas en vigor.',
                                  { icon: 'exclamation-triangle-fill', title: 'Confirmar inactivación', confirmText: 'Inactivar' }
                                )
                                if (!confirmado) return
                                const stamp = new Date().toISOString()
                                try {
                                  setDeletingClienteId(c.id)
                                  const res = await deleteCliente(c.id)
                                  setClientes(prev => prev.map(x => x.id === c.id ? { ...x, activo: false, inactivado_at: stamp } : x))
                                  if (isSuper) setClientesSuper(prev => prev.map(x => x.id === c.id ? { ...x, activo: false, inactivado_at: stamp } : x))
                                  setSelectedCliente(prev => (prev && prev.id === c.id) ? { ...prev, activo: false, inactivado_at: stamp } : prev)
                                  await load()
                                  const alreadyInactive = (res as unknown as { alreadyInactive?: boolean }).alreadyInactive
                                  await dialog.alert(alreadyInactive ? 'El cliente ya estaba inactivo.' : 'Cliente inactivado.')
                                } catch (err) {
                                  const msg = err instanceof Error ? err.message : 'Error al inactivar cliente'
                                  await dialog.alert(msg, { icon: 'exclamation-triangle-fill', title: 'Error' })
                                } finally {
                                  setDeletingClienteId(null)
                                }
                              }}
                            >
                              {c.activo === false ? 'Inactivo' : (deletingClienteId === c.id ? 'Inactivando…' : 'Inactivar')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!clientes.length && <tr><td colSpan={7} className="text-center text-muted py-3">Sin resultados</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {editCliente && (
            <AppModal title="Editar cliente" icon="person-fill" onClose={()=>setEditCliente(null)}>
              <div className="grid grid-cols-2 gap-2">
                <div className="d-flex flex-column"><label className="form-label small">Primer nombre</label><input className="form-control form-control-sm" value={editCliente.primer_nombre||''} onChange={e=>setEditCliente({...editCliente, primer_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo nombre</label><input className="form-control form-control-sm" value={editCliente.segundo_nombre||''} onChange={e=>setEditCliente({...editCliente, segundo_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Primer apellido</label><input className="form-control form-control-sm" value={editCliente.primer_apellido||''} onChange={e=>setEditCliente({...editCliente, primer_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo apellido</label><input className="form-control form-control-sm" value={editCliente.segundo_apellido||''} onChange={e=>setEditCliente({...editCliente, segundo_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Teléfono celular</label><input className="form-control form-control-sm" value={editCliente.telefono_celular||''} onChange={e=>setEditCliente({...editCliente, telefono_celular: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Email</label><input className="form-control form-control-sm" type="email" value={editCliente.email||''} onChange={e=>setEditCliente({...editCliente, email: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Cumpleaños</label><input className="form-control form-control-sm" type="date" value={editCliente.fecha_nacimiento || ''} onChange={e=>setEditCliente({...editCliente, fecha_nacimiento: e.target.value})} /></div>
              </div>
              <div className="mt-3 d-flex justify-content-end gap-2">
                <button className="btn btn-sm btn-secondary" onClick={()=>setEditCliente(null)}>Cancelar</button>
                <button className="btn btn-sm btn-success" onClick={()=>submitClienteCambio(editCliente)}>{isSuper? 'Guardar y aprobar':'Enviar solicitud'}</button>
              </div>
            </AppModal>
          )}
          {creating && (
            <AppModal title="Nuevo cliente" icon="person-plus" onClose={()=>!submittingNuevoCliente && setCreating(false)}>
              <div className="grid grid-cols-2 gap-2">
                <div className="d-flex flex-column"><label className="form-label small">Primer nombre</label><input className="form-control form-control-sm" value={nuevo.primer_nombre||''} onChange={e=>setNuevo({...nuevo, primer_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo nombre</label><input className="form-control form-control-sm" value={nuevo.segundo_nombre||''} onChange={e=>setNuevo({...nuevo, segundo_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Primer apellido</label><input className="form-control form-control-sm" value={nuevo.primer_apellido||''} onChange={e=>setNuevo({...nuevo, primer_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo apellido</label><input className="form-control form-control-sm" value={nuevo.segundo_apellido||''} onChange={e=>setNuevo({...nuevo, segundo_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Teléfono celular</label><input className="form-control form-control-sm" value={nuevo.telefono_celular||''} onChange={e=>setNuevo({...nuevo, telefono_celular: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Email</label><input className="form-control form-control-sm" type="email" value={nuevo.email||''} onChange={e=>setNuevo({...nuevo, email: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Cumpleaños</label><input className="form-control form-control-sm" type="date" value={nuevo.fecha_nacimiento || ''} onChange={e=>setNuevo({...nuevo, fecha_nacimiento: e.target.value})} /></div>
                {isSuper && (
                  <div className="d-flex flex-column">
                    <label className="form-label small">Asignar a agente</label>
                    <select className="form-select form-select-sm" value={nuevoAgenteId} onChange={e=>setNuevoAgenteId(e.target.value)}>
                      <option value="">(Para mí mismo)</option>
                      {agentes.map(a => (
                        <option key={a.id} value={a.id_auth||''}>{a.nombre || a.email}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="mt-3 d-flex justify-content-end gap-2">
                <button className="btn btn-sm btn-secondary" disabled={submittingNuevoCliente} onClick={()=>setCreating(false)}>Cancelar</button>
                <button className="btn btn-sm btn-success" disabled={submittingNuevoCliente} onClick={async()=>{
                  if (submittingNuevoCliente) return
                  // Validación mínima requerida por schema
                  if (!nuevo.primer_nombre || !nuevo.primer_apellido || !nuevo.telefono_celular || !nuevo.email) {
                    await dialog.alert('Campos requeridos: Primer nombre, Primer apellido, Teléfono celular y Email')
                    return
                  }
                  try {
                    setSubmittingNuevoCliente(true)
                    const payload: Record<string, unknown> = {
                      primer_nombre: nuevo.primer_nombre,
                      segundo_nombre: nuevo.segundo_nombre,
                      primer_apellido: nuevo.primer_apellido,
                      segundo_apellido: nuevo.segundo_apellido,
                      telefono_celular: nuevo.telefono_celular,
                      email: nuevo.email,
                      fecha_nacimiento: nuevo.fecha_nacimiento || null,
                    }
                    if (isSuper && nuevoAgenteId) {
                      payload.asesor_id = nuevoAgenteId
                    }
                    const res = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)})
                    const j = await res.json()
                    if (!res.ok) { await dialog.alert(j.error || 'Error al crear'); return }
                    // Cerrar modal y limpiar formulario
                    setCreating(false)
                    setNuevo({ id: '', telefono_celular: '', fecha_nacimiento: null })
                    setNuevoAgenteId('')
                    // Limpiar caché de clientes por agente para forzar recarga
                    setClientesPorAgente({})
                    setExpandedAgentes({})
                    // Recargar lista de agentes y clientes
                    await load()
                  } catch { await dialog.alert('Error al crear') } finally { setSubmittingNuevoCliente(false) }
                }}>Crear</button>
              </div>
            </AppModal>
          )}
          {/* Modal de edición de meta removido intencionalmente */}
          {/* Modal para mover cliente a otro agente */}
          {movingCliente && isSuper && (
            <AppModal title="Mover cliente a otro agente" icon="arrow-left-right" onClose={()=>!submittingMove && setMovingCliente(null)}>
              <p className="mb-3">
                Vas a transferir el cliente <strong>{fmtNombre(movingCliente) || movingCliente.email}</strong> a otro agente. 
                Todas las pólizas asociadas a este cliente también se moverán automáticamente.
              </p>
              <div className="d-flex flex-column">
                <label className="form-label">Agente destino</label>
                <select 
                  className="form-select" 
                  value={targetAgenteId} 
                  onChange={e=>setTargetAgenteId(e.target.value)}
                  disabled={submittingMove}
                >
                  <option value="">Selecciona un agente...</option>
                  {agentes.map(a => (
                    <option key={a.id} value={a.id_auth||''}>{a.nombre || a.email}</option>
                  ))}
                </select>
              </div>
              <div className="mt-3 d-flex justify-content-end gap-2">
                <button className="btn btn-sm btn-secondary" disabled={submittingMove} onClick={()=>setMovingCliente(null)}>Cancelar</button>
                <button 
                  className="btn btn-sm btn-primary" 
                  disabled={submittingMove || !targetAgenteId}
                  onClick={async()=>{
                    if (!targetAgenteId || !movingCliente) return
                    try {
                      setSubmittingMove(true)
                      const res = await fetch(`/api/clientes/${movingCliente.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ asesor_id: targetAgenteId })
                      })
                      const j = await res.json()
                      if (!res.ok) {
                        await dialog.alert(j.error || 'Error al mover cliente')
                        return
                      }
                      await dialog.alert('Cliente movido exitosamente')
                      setMovingCliente(null)
                      setTargetAgenteId('')
                      // Limpiar caché de clientes por agente para forzar recarga
                      setClientesPorAgente({})
                      setExpandedAgentes({})
                      // Recargar datos siempre y volver a la lista
                      await load()
                      if (view !== 'list') setView('list')
                    } catch (e) {
                      await dialog.alert('Error al mover cliente')
                    } finally {
                      setSubmittingMove(false)
                    }
                  }}
                >
                  Mover cliente
                </button>
              </div>
            </AppModal>
          )}
        </section>
      )}

      {view === 'cliente' && selectedCliente && (
        <section className="border rounded p-3">
          <div className="d-flex align-items-center mb-3 gap-2">
            <button className="btn btn-sm btn-light border" onClick={()=>setView('list')}>← Volver</button>
            <h2 className="mb-0">Cliente</h2>
            <div className="ms-2">{renderEstadoBadge(selectedCliente)}</div>
            <span className="ms-auto small text-muted">Número de cliente: {selectedCliente.cliente_code || selectedCliente.id}</span>
          </div>
          <div className="mb-3">
            <div className="row g-2">
              <div className="col-md-4">
                <label className="form-label small">Nombre</label>
                <div className="form-control form-control-sm">{fmtNombre(selectedCliente)}</div>
              </div>
              <div className="col-md-4">
                <label className="form-label small">Teléfono</label>
                <div className="form-control form-control-sm">
                  {selectedCliente.telefono_celular ? (
                    <a
                      href={buildWhatsAppLink(selectedCliente.telefono_celular, agentDisplayName)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {selectedCliente.telefono_celular}
                    </a>
                  ) : '—'}
                </div>
              </div>
              <div className="col-md-4">
                <label className="form-label small">Email</label>
                <div className="form-control form-control-sm">
                  {selectedCliente.email ? (
                    <a href={`mailto:${selectedCliente.email}`}>{selectedCliente.email}</a>
                  ) : '—'}
                </div>
              </div>
            </div>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={()=>{ if(selectedCliente) void openPolizas(selectedCliente) }}>Ver pólizas</button>
            <button className="btn btn-sm btn-primary" onClick={()=>setEditCliente({...selectedCliente})}>Editar</button>
            {isSuper && (
              <button className="btn btn-sm btn-warning" onClick={()=>{ setMovingCliente(selectedCliente); setTargetAgenteId('') }}>
                <i className="bi bi-arrow-left-right me-1"></i>Mover a otro agente
              </button>
            )}
          </div>
          {editCliente && (
            <div className="mt-3 border rounded p-3 bg-light">
              <h3 className="small fw-bold mb-2">Editar cliente</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="d-flex flex-column"><label className="form-label small">Primer nombre</label><input className="form-control form-control-sm" value={editCliente.primer_nombre||''} onChange={e=>setEditCliente({...editCliente, primer_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo nombre</label><input className="form-control form-control-sm" value={editCliente.segundo_nombre||''} onChange={e=>setEditCliente({...editCliente, segundo_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Primer apellido</label><input className="form-control form-control-sm" value={editCliente.primer_apellido||''} onChange={e=>setEditCliente({...editCliente, primer_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo apellido</label><input className="form-control form-control-sm" value={editCliente.segundo_apellido||''} onChange={e=>setEditCliente({...editCliente, segundo_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Teléfono celular</label><input className="form-control form-control-sm" value={editCliente.telefono_celular||''} onChange={e=>setEditCliente({...editCliente, telefono_celular: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Email</label><input className="form-control form-control-sm" type="email" value={editCliente.email||''} onChange={e=>setEditCliente({...editCliente, email: e.target.value})} /></div>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-sm btn-secondary" onClick={()=>setEditCliente(null)}>Cancelar</button>
                <button className="btn btn-sm btn-success" onClick={()=>submitClienteCambio(editCliente)}>{isSuper? 'Guardar y aprobar':'Enviar solicitud'}</button>
              </div>
            </div>
          )}
        </section>
      )}
      {view === 'polizas' && selectedCliente && (
        <section className="border rounded p-3">
          <div className="d-flex align-items-center mb-3 gap-2">
            <button className="btn btn-sm btn-light border" onClick={()=>setView('list')}>← Volver</button>
            <h2 className="mb-0">Pólizas de {fmtNombre(selectedCliente) || selectedCliente.email || selectedCliente.id}</h2>
            <div className="d-flex align-items-end gap-2 ms-auto flex-wrap">
              <div className="d-flex flex-column" style={{minWidth: 220}}>
                <label className="form-label small mb-1">Buscar pólizas</label>
                <input className="form-control form-control-sm" placeholder="No. póliza o producto" value={qPolizas} onChange={e=>setQPolizas(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter' && selectedCliente) { void openPolizas(selectedCliente) } }} />
              </div>
              <button className="btn btn-sm btn-success" onClick={()=>{ setAddingPoliza(true); setNuevaPoliza({ numero_poliza:'', fecha_emision:'', fecha_renovacion:'', fecha_limite_pago:'', estatus:'EN_VIGOR', forma_pago:'', periodicidad_pago: undefined, dia_pago:'', prima_input:'', prima_moneda:'MXN', meses_check:{}, producto_parametro_id: undefined }) }}>Agregar póliza</button>
            </div>
          </div>
    <div className="table-responsive small">
            <table className="table table-sm table-striped align-middle">
              <thead>
                <tr>
                  <th>No. Póliza</th>
                  <th>Producto</th>
                  <th>Estatus</th>
                  <th>Periodicidad</th>
                  <th>Método pago</th>
                  <th>Fecha de emisión</th>
                  <th>Fecha renovación</th>
                  <th>Tipo</th>
                  <th>Día de pago</th>
                  <th>Prima</th>
                  {tableMonthKeys.map(m => <th key={m}>{shortMonthHeader(m)}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {polizas.map(p => (
                  <tr key={p.id}>
                    <td className="text-xs">{p.numero_poliza || '—'}</td>
                    <td className="text-xs">{p.producto_nombre || '—'}</td>
                    <td className="text-xs">{p.estatus || '—'}</td>
                    <td className="text-xs">{p.periodicidad_pago || '—'}</td>
                    <td className="text-xs">{p.forma_pago || '—'}</td>
                    <td className="text-xs">{p.fecha_emision ? new Date(p.fecha_emision).toLocaleDateString() : '—'}</td>
                    <td className="text-xs">{p.fecha_renovacion ? new Date(p.fecha_renovacion).toLocaleDateString() : '—'}</td>
                    <td className="text-xs">{p.tipo_producto || '—'}</td>
                    <td className="text-xs">{p.dia_pago ?? '—'}</td>
                    <td className="text-xs">{typeof p.prima_input === 'number' ? formatMoney(p.prima_input, p.prima_moneda) : '—'}</td>
                    {generateMonthKeys(p).map(m => <td key={m} className="text-center text-xs">{p.meses_check && p.meses_check[m] ? '✔' : ''}</td>)}
                    <td className="text-end">
                      <button className="btn btn-sm btn-primary" onClick={()=>setEditPoliza(normalizePolizaDates(p))}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {addingPoliza && (
            <AppModal title="Agregar póliza" icon="file-earmark-plus" onClose={()=>!submittingNuevaPoliza && setAddingPoliza(false)}>
              <div className="grid grid-cols-2 gap-3">
                <div className="d-flex flex-column">
                  <label className="form-label small">No. Póliza</label>
                  <input className="form-control form-control-sm" value={nuevaPoliza.numero_poliza} onChange={e=>setNuevaPoliza({...nuevaPoliza, numero_poliza: e.target.value})} />
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Fecha de emisión</label>
                  <input className="form-control form-control-sm" type="date" value={nuevaPoliza.fecha_emision} onChange={e=>setNuevaPoliza({...nuevaPoliza, fecha_emision: e.target.value})} />
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Fecha de renovación (opcional)</label>
                  <input className="form-control form-control-sm" type="date" value={nuevaPoliza.fecha_renovacion} onChange={e=>setNuevaPoliza({...nuevaPoliza, fecha_renovacion: e.target.value})} />
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Fecha límite de pago</label>
                  <input
                    className="form-control form-control-sm"
                    type="date"
                    required
                    title="Se repite cada periodo usando este día; formato yyyy-mm-dd"
                    value={nuevaPoliza.fecha_limite_pago}
                    onChange={e=>setNuevaPoliza({...nuevaPoliza, fecha_limite_pago: e.target.value})}
                  />
                  <span className="form-text" style={{ fontSize: '11px' }}>Se repite cada periodo con este día (formato yyyy-mm-dd).</span>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Tipo de producto</label>
                  <select className="form-select form-select-sm" value={tipoProducto} onChange={e=>{ setTipoProducto(e.target.value); setNuevaPoliza({...nuevaPoliza, producto_parametro_id: undefined, prima_moneda: 'MXN'}) }}>
                    <option value="">Selecciona uno</option>
                    <option value="VI">Vida (VI)</option>
                    <option value="GMM">Gastos médicos (GMM)</option>
                  </select>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Producto parametrizado (requerido)</label>
                  <select className="form-select form-select-sm" disabled={!tipoProducto} value={nuevaPoliza.producto_parametro_id || ''} onChange={e=>{
                      const value = e.target.value || undefined
                      let updated = { ...nuevaPoliza, producto_parametro_id: value }
                      if (value) {
                        const prod = productos.find(p=>p.id===value)
                        if (prod) {
                          updated = {
                            ...updated,
                            prima_moneda: prod.moneda || 'MXN'
                          }
                        }
                      } else {
                        updated = { ...updated, prima_moneda: 'MXN' }
                      }
                      setNuevaPoliza(updated)
                    }}>
                    <option value="">Sin seleccionar</option>
                    {productos.filter(p => !tipoProducto || p.tipo_producto === tipoProducto).map(p => (
                      <option key={p.id} value={p.id}>{p.nombre_comercial} ({p.tipo_producto})</option>
                    ))}
                  </select>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Periodicidad</label>
                  <select
                    className="form-select form-select-sm"
                    value={normalizePeriodicidadValue(nuevaPoliza.periodicidad_pago) || ''}
                    onChange={e=>{
                      const norm = normalizePeriodicidadValue(e.target.value)
                      setNuevaPoliza({
                        ...nuevaPoliza,
                        periodicidad_pago: norm || undefined
                      })
                    }}
                  >
                    <option value="">Selecciona…</option>
                    <option value="anual">Anual (A)</option>
                    <option value="semestral">Semestral (S)</option>
                    <option value="trimestral">Trimestral (T)</option>
                    <option value="mensual">Mensual (M)</option>
                  </select>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Método de pago</label>
                  <select className="form-select form-select-sm" value={nuevaPoliza.forma_pago} onChange={e=>setNuevaPoliza({...nuevaPoliza, forma_pago: e.target.value})}>
                    <option value="">Selecciona…</option>
                    <option value="MODO_DIRECTO">Modo directo</option>
                    <option value="CARGO_AUTOMATICO">Cargo automático</option>
                  </select>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Prima anual</label>
                  <input
                    className="form-control form-control-sm"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    placeholder="0.00"
                    value={nuevaPoliza.prima_input}
                    onChange={e=>{
                      const v = e.target.value
                      const cleaned = v.replace(/[^0-9.,]/g, '')
                      setNuevaPoliza({ ...nuevaPoliza, prima_input: cleaned })
                    }}
                    onBlur={()=>{
                      const asNumber = Number((nuevaPoliza.prima_input||'').replace(',', '.'))
                      if (isFinite(asNumber)) {
                        setNuevaPoliza({ ...nuevaPoliza, prima_input: asNumber.toFixed(2) })
                      }
                    }}
                  />
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Día de pago</label>
                  <input className="form-control form-control-sm" type="number" min={1} max={31} value={nuevaPoliza.dia_pago} onChange={e=>setNuevaPoliza({...nuevaPoliza, dia_pago: e.target.value})} />
                </div>
                {/* Moneda prima oculta autocompletada */}
                <input type="hidden" value={nuevaPoliza.prima_moneda} />
              </div>
              <div className="mt-3 d-flex justify-content-end gap-2">
                <button className="btn btn-sm btn-secondary" disabled={submittingNuevaPoliza} onClick={()=>setAddingPoliza(false)}>Cancelar</button>
                {(() => {
                  const dup = !!(nuevaPoliza.numero_poliza && polizas.some(p => (p.numero_poliza||'').trim() === nuevaPoliza.numero_poliza.trim()))
                  return (
                    <>
                      {dup && <span className="text-danger small me-2">Este número de póliza ya existe en la lista.</span>}
                      <button className="btn btn-sm btn-success" disabled={submittingNuevaPoliza || dup} onClick={async()=>{
                  if (submittingNuevaPoliza) return
                  const primaNum = Number((nuevaPoliza.prima_input||'').replace(/,/g,''))
                  if (!selectedCliente?.id || !nuevaPoliza.producto_parametro_id || !nuevaPoliza.numero_poliza || !nuevaPoliza.fecha_emision || !nuevaPoliza.fecha_limite_pago || !nuevaPoliza.periodicidad_pago || !nuevaPoliza.forma_pago || !isFinite(primaNum)) { await dialog.alert('Campos requeridos: Producto, No. Póliza, Fecha de emisión, Fecha límite de pago, Periodicidad, Método de pago, Prima anual'); return }
                  if (!nuevaPoliza.fecha_limite_pago || !nuevaPoliza.fecha_limite_pago.trim()) { await dialog.alert('Fecha límite de pago es requerida'); return }
                  const payload: Record<string, unknown> = {
                    cliente_id: selectedCliente.id,
                    numero_poliza: nuevaPoliza.numero_poliza,
                    fecha_emision: nuevaPoliza.fecha_emision,
                    fecha_renovacion: nuevaPoliza.fecha_renovacion || null,
                    fecha_limite_pago: nuevaPoliza.fecha_limite_pago,
                    estatus: nuevaPoliza.estatus || null,
                    forma_pago: nuevaPoliza.forma_pago,
                    periodicidad_pago: normalizePeriodicidadValue(nuevaPoliza.periodicidad_pago),
                    // tipo_pago removido
                    dia_pago: nuevaPoliza.dia_pago ? Number(nuevaPoliza.dia_pago) : null,
                    prima_input: primaNum,
                    prima_moneda: nuevaPoliza.prima_moneda || 'MXN',
                    meses_check: nuevaPoliza.meses_check,
                  }
                  if (nuevaPoliza.producto_parametro_id) payload.producto_parametro_id = nuevaPoliza.producto_parametro_id
                  try {
                    setSubmittingNuevaPoliza(true)
                    const r = await fetch('/api/polizas', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
                    const j = await r.json()
                    if (!r.ok) { await dialog.alert(j.error || 'Error al crear'); return }
                    setAddingPoliza(false)
                    setLoading(true)
                    try {
                      const url = new URL('/api/polizas', window.location.origin)
                      url.searchParams.set('cliente_id', selectedCliente.id)
                      if (qPolizas.trim()) url.searchParams.set('q', qPolizas.trim())
                      const rp = await fetch(url.toString())
                      const jp = await rp.json()
                      const items: Poliza[] = Array.isArray(jp.items) ? (jp.items as Poliza[]) : []
                      setPolizas(items.map(normalizePolizaDates))
                    } finally { setLoading(false) }
                  } catch { await dialog.alert('Error al crear') } finally { setSubmittingNuevaPoliza(false) }
                }}>Crear</button>
                    </>
                  )
                })()}
              </div>
            </AppModal>
          )}
          {/* agregar póliza modal deshabilitado temporalmente */}
        </section>
      )}

      {editPoliza && (
        <AppModal title={`Editar póliza ${editPoliza.numero_poliza || ''}`} icon="file-earmark-text" onClose={()=>setEditPoliza(null)}>
          <div className="grid grid-cols-2 gap-2">
            <div className="d-flex flex-column"><label className="form-label small">No. Póliza</label><input className="form-control form-control-sm" value={editPoliza.numero_poliza||''} onChange={e=>setEditPoliza({...editPoliza, numero_poliza: e.target.value})} /></div>
            <div className="d-flex flex-column"><label className="form-label small">Estatus</label>
              <select
                className="form-select form-select-sm"
                value={editPoliza.estatus || 'EN_VIGOR'}
                onChange={e=> setEditPoliza({ ...editPoliza, estatus: e.target.value })}
              >
                <option value="EN_VIGOR">En vigor</option>
                <option value="ANULADA">Anulada</option>
              </select>
            </div>
            <div className="d-flex flex-column"><label className="form-label small">Periodicidad</label>
              <select
                className="form-select form-select-sm"
                value={normalizePeriodicidadValue(editPoliza.periodicidad_pago)||''}
                onChange={e=>{
                  const norm = normalizePeriodicidadValue(e.target.value)
                  setEditPoliza({ ...editPoliza, periodicidad_pago: norm || undefined })
                }}
              >
                <option value="">—</option>
                <option value="anual">Anual (A)</option>
                <option value="semestral">Semestral (S)</option>
                <option value="trimestral">Trimestral (T)</option>
                <option value="mensual">Mensual (M)</option>
              </select>
            </div>
            <div className="d-flex flex-column"><label className="form-label small">Método de pago</label>
              <select className="form-select form-select-sm" value={editPoliza.forma_pago||''} onChange={e=>setEditPoliza({...editPoliza, forma_pago: e.target.value})}>
                <option value="">—</option>
                <option value="MODO_DIRECTO">Modo directo</option>
                <option value="CARGO_AUTOMATICO">Cargo automático</option>
              </select>
            </div>
            <div className="d-flex flex-column"><label className="form-label small">Fecha emisión</label><input className="form-control form-control-sm" type="date" value={editPoliza.fecha_emision || ''} onChange={e=>setEditPoliza({...editPoliza, fecha_emision: e.target.value})} /></div>
            <div className="d-flex flex-column"><label className="form-label small">Fecha renovación</label><input className="form-control form-control-sm" type="date" value={editPoliza.fecha_renovacion || ''} onChange={e=>setEditPoliza({...editPoliza, fecha_renovacion: e.target.value||undefined})} /></div>
            <div className="d-flex flex-column">
              <label className="form-label small">Fecha límite de pago (requerida)</label>
              <input
                className="form-control form-control-sm"
                type="date"
                required
                title="Se repite cada periodo usando este día; formato yyyy-mm-dd"
                value={editPoliza.fecha_limite_pago || ''}
                onChange={e=>setEditPoliza({...editPoliza, fecha_limite_pago: e.target.value||undefined})}
              />
              <span className="form-text" style={{ fontSize: '11px' }}>Se repite cada periodo con este día (formato yyyy-mm-dd).</span>
            </div>
            <div className="d-flex flex-column"><label className="form-label small">Tipo</label><input className="form-control form-control-sm" disabled value={editPoliza.tipo_producto || ''} /></div>
            <div className="d-flex flex-column"><label className="form-label small">Día de pago</label><input className="form-control form-control-sm" type="number" min={1} max={31} value={editPoliza.dia_pago ?? ''} onChange={e=>{ const v = parseInt(e.target.value,10); setEditPoliza({...editPoliza, dia_pago: isFinite(v)? v:null}) }} /></div>
            <div className="d-flex flex-column"><label className="form-label small">Prima anual</label>
              <input
                className="form-control form-control-sm"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                placeholder="0.00"
                value={editPrimaText}
                onChange={e=>{
                  // Permitir dígitos, punto o coma como decimal; no aplicar formateo aquí
                  const v = e.target.value
                  // Mantener sólo dígitos, separadores y signo
                  const cleaned = v.replace(/[^0-9.,-]/g, '')
                  setEditPrimaText(cleaned)
                  const asNumber = parseMoneyInput(cleaned)
                  setEditPoliza({ ...editPoliza, prima_input: (asNumber!=null && Number.isFinite(asNumber)) ? asNumber : null })
                }}
                onBlur={() => {
                  // Normalizar a 2 decimales si es un número válido
                  const asNumber = parseMoneyInput(editPrimaText)
                  if (asNumber!=null && Number.isFinite(asNumber)) setEditPrimaText(asNumber.toFixed(2))
                }}
              />
            </div>
          </div>
          <div className="mt-2 small">
            <strong>Meses</strong>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #ddd' }} className="p-2 mt-1">
              <div className="d-flex flex-wrap gap-3">
                {generateMonthKeys(editPoliza).map(m => (
                  <div key={m} className="d-flex flex-column" style={{ width: '120px', fontSize: '11px' }}>
                    <label className="form-check-label d-flex align-items-center gap-1">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={!!(editPoliza.meses_check && editPoliza.meses_check[m])}
                        onChange={e=>{
                          const next = { ...(editPoliza.meses_check||{}) }
                          const nextMontos = { ...(editPoliza.meses_montos||{}) }
                          if (e.target.checked) {
                            next[m] = true
                            if (nextMontos[m] == null) {
                              const def = defaultMontoPeriodo(editPoliza)
                              nextMontos[m] = def != null ? def : Number(editPoliza.prima_input ?? 0)
                            }
                          } else {
                            delete next[m]
                            delete nextMontos[m]
                          }
                          setEditPoliza({ ...editPoliza, meses_check: next, meses_montos: nextMontos })
                        }}
                      />
                      {shortMonthHeader(m)}
                    </label>
                    {!!(editPoliza.meses_check && editPoliza.meses_check[m]) && (
                      <input
                        className="form-control form-control-sm mt-1"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editPoliza.meses_montos?.[m] ?? ''}
                        onChange={e=>{
                          const val = e.target.value
                          const num = val === '' ? null : Number(val)
                          const nextMontos = { ...(editPoliza.meses_montos||{}) }
                          if (val === '') { delete nextMontos[m] }
                          else { nextMontos[m] = Number.isFinite(num) ? num : null }
                          setEditPoliza({ ...editPoliza, meses_montos: nextMontos })
                        }}
                        placeholder="Monto"
                        title="Monto pagado para este mes"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 d-flex justify-content-end gap-2">
            <button className="btn btn-sm btn-secondary" onClick={()=>setEditPoliza(null)}>Cancelar</button>
            <button className="btn btn-sm btn-success" disabled={savingPoliza} onClick={()=>submitPolizaCambio(editPoliza)}>{savingPoliza ? 'Guardando…' : (isSuper? 'Guardar y aprobar':'Enviar solicitud')}</button>
          </div>
        </AppModal>
      )}
    </div>
  )
}

function renderEstadoBadge(c: Cliente): React.ReactNode {
  if (c.activo === false) {
    const inactiveDate = c.inactivado_at ? new Date(c.inactivado_at) : null
    const inactiveSince = inactiveDate && !Number.isNaN(inactiveDate.valueOf()) ? inactiveDate.toLocaleDateString() : null
    return <span className="badge text-bg-secondary">{inactiveSince ? `Inactivo · ${inactiveSince}` : 'Inactivo'}</span>
  }
  return <span className="badge text-bg-success">Activo</span>
}

function fmtNombre(c: Cliente) {
  const parts = [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean)
  return parts.length ? parts.join(' ') : '—'
}
function emptyAsUndef(v?: string|null) { const s = (v||'').trim(); return s ? s : undefined }
function formatMoney(v: number, moneda?: string|null) {
  try { return (moneda ? (moneda + ' ') : '$') + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } catch { return (moneda? moneda+' ':'$') + v.toFixed(2) }
}
function generateMonthKeys(poliza?: { fecha_emision?: string|null; fecha_renovacion?: string|null; periodicidad_pago?: string|null }, fallbackMonths = 24) {
  const map: Record<string, number> = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 }
  const norm = poliza?.periodicidad_pago ? normalizePeriodicidadValue(poliza.periodicidad_pago) : null
  const step = map[norm || ''] || 1

  const parseMonthStart = (value?: string|null): Date | null => {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.valueOf())) return null
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  }

  const start = parseMonthStart(poliza?.fecha_emision)
  const end = parseMonthStart(poliza?.fecha_renovacion)

  const keys: string[] = []
  // Fallback: si no hay fechas, mantener comportamiento previo (enero 2025 en adelante)
  if (!start) {
    const fallbackStart = new Date(Date.UTC(2025, 0, 1))
    for (let i=0;i<fallbackMonths;i++) {
      const d = new Date(Date.UTC(fallbackStart.getUTCFullYear(), fallbackStart.getUTCMonth() + i, 1))
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth()+1).padStart(2,'0')
      keys.push(`${y}-${m}`)
    }
    return keys
  }

  // Si no hay fecha de renovación, generar un año por defecto usando la periodicidad (inclusive)
  const computedEnd = end || new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (fallbackMonths-1), 1))

  const guardMax = 120 // evita loops infinitos
  for (let i = 0; i < guardMax; i++) {
    const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (i * step), 1))
    // Si hay fecha de renovación real, no incluir ese mes como pago (end es exclusivo)
    if (end && current >= computedEnd) break
    // Si es fallback (sin renovación), incluir hasta computedEnd inclusive
    if (!end && current > computedEnd) break
    const y = current.getUTCFullYear()
    const m = String(current.getUTCMonth()+1).padStart(2,'0')
    keys.push(`${y}-${m}`)
  }
  return keys
}

function defaultMontoPeriodo(poliza?: { prima_input?: number|null; periodicidad_pago?: string|null }) {
  if (!poliza || typeof poliza.prima_input !== 'number' || !Number.isFinite(poliza.prima_input)) return null
  const norm = poliza.periodicidad_pago ? normalizePeriodicidadValue(poliza.periodicidad_pago) : null
  const map: Record<string, number> = { mensual: 12, trimestral: 4, semestral: 2, anual: 1 }
  const divisor = map[norm || ''] || 1
  return Number((poliza.prima_input / divisor).toFixed(2))
}
function shortMonthHeader(key: string) {
  const [y,m] = key.split('-')
  return `${m}/${y.slice(2)}`
}

// Helpers para hipervínculos
function normalizePhoneMx(raw: string): string {
  // Quitar todo excepto dígitos
  const digits = (raw || '').replace(/\D/g, '')
  // Si ya parece tener lada país (11-13 dígitos), devolver tal cual
  if (digits.length >= 11) return digits
  // Asumir México (+52)
  return `52${digits}`
}
function buildWhatsAppLink(phone: string, agentName: string): string {
  const normalized = normalizePhoneMx(phone)
  const saludo = `Hola, soy ${agentName} tu asesor de seguros Lealtia`
  const text = encodeURIComponent(saludo)
  return `https://wa.me/${normalized}?text=${text}`
}
