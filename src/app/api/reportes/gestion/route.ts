import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()
    if (!usuario) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const rol = (usuario.rol || '').toLowerCase()
    if (rol !== 'supervisor' && rol !== 'admin') {
      return NextResponse.json({ error: 'No autorizado. Solo supervisores y admins pueden generar este reporte.' }, { status: 403 })
    }

    const supabase = getServiceClient()

    // Obtener parámetro de filtro por agente
    const searchParams = request.nextUrl.searchParams
    const asesorIdFilter = searchParams.get('asesor_id')

    // Consultar clientes con sus pólizas y asesores
    let clientesQuery = supabase
      .from('clientes')
      .select(`
        id,
        primer_nombre,
        segundo_nombre,
        primer_apellido,
        segundo_apellido,
        asesor_id,
        activo
      `)
      .eq('activo', true)
    
    // Si se especifica asesor_id, filtrar por ese asesor
    if (asesorIdFilter) {
      clientesQuery = clientesQuery.eq('asesor_id', asesorIdFilter)
    }
    
    const { data: clientes, error: clientesError } = await clientesQuery.order('primer_apellido')

    if (clientesError) {
      console.error('[/api/reportes/gestion] Error clientes:', clientesError)
      throw clientesError
    }

    if (!clientes || clientes.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          clientes: []
        }
      })
    }

    // Consultar todas las pólizas con datos del producto
    const { data: polizas, error: polizasError } = await supabase
      .from('polizas')
      .select(`
        id,
        cliente_id,
        numero_poliza,
        estatus,
        prima_input,
        periodicidad_pago,
        anulada_at,
        producto_parametro_id
      `)
      .is('anulada_at', null)
      .order('numero_poliza')

    // Consultar producto_parametros por separado para obtener nombres
    const productosIds = [...new Set(polizas?.map(p => p.producto_parametro_id).filter(Boolean))]
    const { data: productos, error: productosError } = await supabase
      .from('producto_parametros')
      .select('id, nombre_comercial')
      .in('id', productosIds)

    if (productosError) {
      console.error('[/api/reportes/gestion] Error productos:', productosError)
    }

    // Crear mapa de productos
    const productosMap = new Map<string, string>()
    productos?.forEach(prod => {
      if (prod.id && prod.nombre_comercial) {
        productosMap.set(prod.id, prod.nombre_comercial)
      }
    })

    if (polizasError) {
      console.error('[/api/reportes/gestion] Error pólizas:', polizasError)
      throw polizasError
    }

    // Consultar pagos mensuales pagados agrupados por póliza
    const { data: pagosData, error: pagosError } = await supabase
      .from('poliza_pagos_mensuales')
      .select('poliza_id, monto_pagado')
      .eq('estado', 'pagado')

    if (pagosError) {
      console.error('[/api/reportes/gestion] Error pagos:', pagosError)
    }

    // Consultar TODOS los pagos (pagados y pendientes) para contar totales
    const { data: todosPagos, error: todosPagosError } = await supabase
      .from('poliza_pagos_mensuales')
      .select('poliza_id, estado')

    if (todosPagosError) {
      console.error('[/api/reportes/gestion] Error todos pagos:', todosPagosError)
    }

    // Crear mapa de conteo de pagos por póliza
    const pagosPorPoliza = new Map<string, { pagados: number; totales: number }>()
    todosPagos?.forEach(pago => {
      if (!pago.poliza_id) return
      const actual = pagosPorPoliza.get(pago.poliza_id) || { pagados: 0, totales: 0 }
      actual.totales++
      if (pago.estado === 'pagado') {
        actual.pagados++
      }
      pagosPorPoliza.set(pago.poliza_id, actual)
    })

    // Consultar base_factor de cada póliza
    const { data: puntosCache, error: puntosCacheError } = await supabase
      .from('poliza_puntos_cache')
      .select('poliza_id, base_factor')

    if (puntosCacheError) {
      console.error('[/api/reportes/gestion] Error puntos cache:', puntosCacheError)
    }

    // Crear mapa de base_factor por póliza
    const baseFactorMap = new Map<string, number>()
    puntosCache?.forEach(pc => {
      if (pc.poliza_id && pc.base_factor != null) {
        baseFactorMap.set(pc.poliza_id, pc.base_factor)
      }
    })

    // Calcular total pagado por póliza
    const totalPagadoPorPoliza = new Map<string, number>()
    pagosData?.forEach(pago => {
      if (!pago.poliza_id) return
      const actual = totalPagadoPorPoliza.get(pago.poliza_id) || 0
      totalPagadoPorPoliza.set(pago.poliza_id, actual + (pago.monto_pagado || 0))
    })

    // Calcular comisión por póliza: total_pagado * base_factor / 100
    const comisionPorPoliza = new Map<string, number>()
    totalPagadoPorPoliza.forEach((totalPagado, polizaId) => {
      const baseFactor = baseFactorMap.get(polizaId) || 0
      const comision = totalPagado * baseFactor / 100
      comisionPorPoliza.set(polizaId, comision)
    })

    console.log('[/api/reportes/gestion] Pólizas con pagos:', totalPagadoPorPoliza.size)
    console.log('[/api/reportes/gestion] Pólizas con base_factor:', baseFactorMap.size)
    console.log('[/api/reportes/gestion] Comisiones calculadas:', comisionPorPoliza.size)

    // Consultar comisiones totales por agente para el resumen
    const { data: comisionesAgente, error: comisionesError } = await supabase
      .from('vw_comisiones_agente_mes')
      .select('asesor_id, agente_nombre, comision_vigente')

    if (comisionesError) {
      console.error('[/api/reportes/gestion] Error comisiones:', comisionesError)
    }

    // Crear mapa de comisión total por agente (id_auth)
    const comisionesPorAgente = new Map<string, number>()
    comisionesAgente?.forEach(c => {
      if (!c.asesor_id) return
      const actual = comisionesPorAgente.get(c.asesor_id) || 0
      comisionesPorAgente.set(c.asesor_id, actual + (c.comision_vigente || 0))
    })

    // Consultar usuarios (asesores)
    const { data: usuarios, error: usuariosError } = await supabase
      .from('usuarios')
      .select('id, id_auth, nombre, email')
      .eq('activo', true)

    if (usuariosError) {
      console.error('[/api/reportes/gestion] Error usuarios:', usuariosError)
      throw usuariosError
    }

    // Mapear usuarios por id_auth
    const usuariosMap = new Map()
    usuarios?.forEach(u => {
      if (u.id_auth) {
        usuariosMap.set(u.id_auth, { nombre: u.nombre || 'Sin nombre', email: u.email || '-' })
      }
    })

    // Agrupar pólizas por cliente_id
    const polizasPorCliente = new Map<string, typeof polizas>()
    polizas?.forEach(p => {
      if (!polizasPorCliente.has(p.cliente_id)) {
        polizasPorCliente.set(p.cliente_id, [])
      }
      polizasPorCliente.get(p.cliente_id)!.push(p)
    })

    // Construir estructura de datos para el PDF
    const resultado = clientes.map(cliente => {
      const nombreCliente = [
        cliente.primer_nombre,
        cliente.segundo_nombre,
        cliente.primer_apellido,
        cliente.segundo_apellido
      ].filter(Boolean).join(' ') || 'Sin nombre'

      const asesor = usuariosMap.get(cliente.asesor_id) || { nombre: 'Sin asesor', email: '-' }
      const comisionTotalAsesor = comisionesPorAgente.get(cliente.asesor_id) || 0
      
      const polizasCliente = polizasPorCliente.get(cliente.id) || []
      
      const polizasFormateadas = polizasCliente.map(p => {
        const productoNombre = p.producto_parametro_id ? productosMap.get(p.producto_parametro_id) || '-' : '-'
        const comision = comisionPorPoliza.get(p.id) || 0
        const pagosInfo = pagosPorPoliza.get(p.id) || { pagados: 0, totales: 0 }
        return {
          numero_poliza: p.numero_poliza || '-',
          producto_nombre: productoNombre,
          periodicidad: p.periodicidad_pago || '-',
          estatus: p.estatus || '-',
          prima: p.prima_input || 0,
          comision_vigente: comision,
          pagos_realizados: pagosInfo.pagados,
          pagos_totales: pagosInfo.totales
        }
      })

      return {
        cliente_nombre: nombreCliente,
        asesor_nombre: asesor.nombre,
        asesor_email: asesor.email,
        comision_total_asesor: comisionTotalAsesor,
        polizas: polizasFormateadas
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        clientes: resultado
      }
    })

  } catch (error) {
    console.error('[/api/reportes/gestion] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json(
      { error: `Error al generar reporte: ${errorMessage}` },
      { status: 500 }
    )
  }
}
