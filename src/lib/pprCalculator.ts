import { getUDIValue, getUDIValueOrBefore } from '@/lib/udi'
import {
  getPprAgeRange,
  PPR_PLANS,
  PPR_PLAN_TABLE,
  type PprPlanKey
} from '@/lib/pprPlanData'

export type { PprPlanKey } from '@/lib/pprPlanData'

export interface PprResult {
  plan: PprPlanKey
  planNombre: string
  edad: number
  aniosPago: number
  primaAnualMXN: number
  primaAnualUDI: number
  primaMensualMXN: number
  totalAportadoMXN: number
  meta65MXN: number
  deduccionISR_MXN: number
  totalAhorroMXN: number
  udiActual: number
  udiTermino: number
  esProyeccion: boolean
}

export async function calculatePpr(age: number, plan: PprPlanKey): Promise<PprResult> {
  const range = getPprAgeRange(age)
  if (!range || !PPR_PLAN_TABLE[range]) throw new Error('La edad debe estar entre 18 y 50 años')
  const planData = PPR_PLAN_TABLE[range][plan]
  const planInfo = PPR_PLANS[plan]
  const aniosPago = plan === '65' ? 65 - range : planInfo.anios

  const today = new Date().toISOString().slice(0, 10)
  const currentUdi = await getUDIValueOrBefore(today)
  if (!currentUdi) throw new Error('No fue posible consultar el valor actual de la UDI')

  const endDate = new Date()
  endDate.setFullYear(endDate.getFullYear() + aniosPago)
  const projectedEnd = await getUDIValue(endDate.toISOString().slice(0, 10))
    || await getUDIValueOrBefore(endDate.toISOString().slice(0, 10))
  const udiEnd = projectedEnd?.valor || currentUdi.valor

  let udi65 = udiEnd
  if (plan !== '65') {
    const age65Date = new Date()
    age65Date.setFullYear(age65Date.getFullYear() + (65 - range))
    const projected65 = await getUDIValue(age65Date.toISOString().slice(0, 10))
      || await getUDIValueOrBefore(age65Date.toISOString().slice(0, 10))
    udi65 = projected65?.valor || udiEnd
  }

  const averageUdi = (currentUdi.valor + udiEnd) / 2
  const primaAnualMXN = planData.primaAnualUDI * currentUdi.valor
  const totalAportadoMXN = planData.primaAnualUDI * aniosPago * averageUdi
  const meta65MXN = planData.meta65UDI * (plan === '65' ? udiEnd : udi65)
  const deduccionISR_MXN = totalAportadoMXN * 0.30

  return {
    plan,
    planNombre: planInfo.nombre,
    edad: age,
    aniosPago,
    primaAnualMXN,
    primaAnualUDI: planData.primaAnualUDI,
    primaMensualMXN: primaAnualMXN / 12,
    totalAportadoMXN,
    meta65MXN,
    deduccionISR_MXN,
    totalAhorroMXN: meta65MXN + deduccionISR_MXN,
    udiActual: currentUdi.valor,
    udiTermino: udiEnd,
    esProyeccion: projectedEnd?.is_projection || false
  }
}
