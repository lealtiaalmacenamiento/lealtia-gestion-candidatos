/**
 * Utilidades para obtener y calcular valores de UDI
 * Soporta tanto datos reales de Banxico como proyecciones a 65 años
 */

import { supabase } from './supabaseClient'

/**
 * Obtiene el valor de UDI para una fecha específica
 * @param fecha - Fecha en formato YYYY-MM-DD
 * @returns Valor de UDI (real o proyectado) y si es proyección
 */
export async function getUDIValue(fecha: string): Promise<{
  valor: number
  is_projection: boolean
} | null> {
  const { data, error } = await supabase
    .from('udi_values')
    .select('valor, is_projection')
    .eq('fecha', fecha)
    .single()

  if (error || !data) return null
  
  return {
    valor: data.valor,
    is_projection: data.is_projection ?? false
  }
}

/**
 * Obtiene el valor de UDI más cercano a una fecha (busca hacia atrás)
 * @param fecha - Fecha en formato YYYY-MM-DD
 * @returns Valor de UDI más cercano o null
 */
export async function getUDIValueOrBefore(fecha: string): Promise<{
  fecha: string
  valor: number
  is_projection: boolean
} | null> {
  const { data, error } = await supabase
    .from('udi_values')
    .select('fecha, valor, is_projection')
    .lte('fecha', fecha)
    .order('fecha', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  
  return {
    fecha: data.fecha,
    valor: data.valor,
    is_projection: data.is_projection ?? false
  }
}

/**
 * Obtiene valores de UDI para un rango de fechas
 * @param fechaInicio - Fecha inicial YYYY-MM-DD
 * @param fechaFin - Fecha final YYYY-MM-DD
 * @returns Array de valores UDI con sus fechas
 */
export async function getUDIRange(
  fechaInicio: string,
  fechaFin: string
): Promise<Array<{ fecha: string; valor: number; is_projection: boolean }>> {
  const { data, error } = await supabase
    .from('udi_values')
    .select('fecha, valor, is_projection')
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin)
    .order('fecha', { ascending: true })

  if (error || !data) return []
  
  return data.map(row => ({
    fecha: row.fecha,
    valor: row.valor,
    is_projection: row.is_projection ?? false
  }))
}

/**
 * Convierte un monto en pesos a UDIs en una fecha específica
 * @param monto - Monto en pesos mexicanos
 * @param fecha - Fecha para la conversión
 * @returns Monto en UDIs o null si no hay valor
 */
export async function convertirPesosAUDI(
  monto: number,
  fecha: string
): Promise<number | null> {
  const result = await getUDIValue(fecha)
  if (!result) return null
  return monto / result.valor
}

/**
 * Convierte un monto en UDIs a pesos en una fecha específica
 * @param udis - Monto en UDIs
 * @param fecha - Fecha para la conversión
 * @returns Monto en pesos mexicanos o null si no hay valor
 */
export async function convertirUDIAPesos(
  udis: number,
  fecha: string
): Promise<number | null> {
  const result = await getUDIValue(fecha)
  if (!result) return null
  return udis * result.valor
}

/**
 * Calcula el valor futuro de un monto en UDIs
 * @param montoPesos - Monto actual en pesos
 * @param fechaActual - Fecha actual
 * @param fechaFutura - Fecha futura (puede ser proyectada)
 * @returns Valor futuro en pesos o null si faltan datos
 */
export async function calcularValorFuturoUDI(
  montoPesos: number,
  fechaActual: string,
  fechaFutura: string
): Promise<{
  udiActual: number
  udiFutura: number
  montoFuturo: number
  esProyeccion: boolean
} | null> {
  const [resultActual, resultFuturo] = await Promise.all([
    getUDIValue(fechaActual),
    getUDIValue(fechaFutura)
  ])

  if (!resultActual || !resultFuturo) return null

  const udis = montoPesos / resultActual.valor
  const montoFuturo = udis * resultFuturo.valor

  return {
    udiActual: resultActual.valor,
    udiFutura: resultFuturo.valor,
    montoFuturo,
    esProyeccion: resultFuturo.is_projection
  }
}

/**
 * Obtiene el último valor real (no proyectado) de UDI
 * @returns Último valor real de UDI disponible
 */
export async function getLastRealUDI(): Promise<{
  fecha: string
  valor: number
} | null> {
  const { data, error } = await supabase
    .from('udi_values')
    .select('fecha, valor')
    .or('is_projection.is.null,is_projection.eq.false')
    .order('fecha', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  
  return {
    fecha: data.fecha,
    valor: data.valor
  }
}

/**
 * Calcula el incremento porcentual de UDI entre dos fechas
 * @param fechaInicio - Fecha inicial
 * @param fechaFin - Fecha final
 * @returns Incremento porcentual o null si faltan datos
 */
export async function calcularIncrementoUDI(
  fechaInicio: string,
  fechaFin: string
): Promise<{
  incrementoPorcentual: number
  valorInicial: number
  valorFinal: number
  esProyeccion: boolean
} | null> {
  const [resultInicio, resultFin] = await Promise.all([
    getUDIValue(fechaInicio),
    getUDIValue(fechaFin)
  ])

  if (!resultInicio || !resultFin) return null

  const incrementoPorcentual = ((resultFin.valor / resultInicio.valor) - 1) * 100

  return {
    incrementoPorcentual,
    valorInicial: resultInicio.valor,
    valorFinal: resultFin.valor,
    esProyeccion: resultFin.is_projection
  }
}
