/**
 * Hooks de React para trabajar con valores de UDI
 */

import { useState, useEffect } from 'react'
import { 
  getUDIValue, 
  getUDIRange, 
  calcularValorFuturoUDI,
  calcularIncrementoUDI
} from '@/lib/udi'

/**
 * Hook para obtener el valor de UDI en una fecha específica
 */
export function useUDIValue(fecha: string) {
  const [data, setData] = useState<{
    valor: number
    is_projection: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!fecha) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    
    getUDIValue(fecha)
      .then(result => {
        setData(result)
      })
      .catch(err => {
        setError(err)
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [fecha])

  return { data, loading, error }
}

/**
 * Hook para obtener un rango de valores de UDI
 */
export function useUDIRange(fechaInicio: string, fechaFin: string) {
  const [valores, setValores] = useState<Array<{ 
    fecha: string
    valor: number
    is_projection: boolean 
  }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!fechaInicio || !fechaFin) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    
    getUDIRange(fechaInicio, fechaFin)
      .then(setValores)
      .catch(err => {
        setError(err)
        setValores([])
      })
      .finally(() => setLoading(false))
  }, [fechaInicio, fechaFin])

  return { valores, loading, error }
}

/**
 * Hook para calcular el valor futuro de un monto en UDIs
 */
export function useValorFuturoUDI(
  montoPesos: number,
  fechaActual: string,
  fechaFutura: string
) {
  const [resultado, setResultado] = useState<{
    udiActual: number
    udiFutura: number
    montoFuturo: number
    esProyeccion: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!montoPesos || !fechaActual || !fechaFutura) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    
    calcularValorFuturoUDI(montoPesos, fechaActual, fechaFutura)
      .then(setResultado)
      .catch(err => {
        setError(err)
        setResultado(null)
      })
      .finally(() => setLoading(false))
  }, [montoPesos, fechaActual, fechaFutura])

  return { resultado, loading, error }
}

/**
 * Hook para calcular el incremento porcentual de UDI entre dos fechas
 */
export function useIncrementoUDI(fechaInicio: string, fechaFin: string) {
  const [resultado, setResultado] = useState<{
    incrementoPorcentual: number
    valorInicial: number
    valorFinal: number
    esProyeccion: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!fechaInicio || !fechaFin) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    
    calcularIncrementoUDI(fechaInicio, fechaFin)
      .then(setResultado)
      .catch(err => {
        setError(err)
        setResultado(null)
      })
      .finally(() => setLoading(false))
  }, [fechaInicio, fechaFin])

  return { resultado, loading, error }
}
