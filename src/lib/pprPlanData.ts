export type PprPlanKey = '65' | '15' | '10'

export interface PprPlanDefinition {
  nombre: string
  anios: number
  sumaAsegurada: number
}

export interface PprPlanData {
  primaAnualUDI: number
  meta65UDI: number
}

export const PPR_PLANS: Record<PprPlanKey, PprPlanDefinition> = {
  '65': { nombre: '65 años', anios: 65, sumaAsegurada: 100000 },
  '15': { nombre: '15 años', anios: 15, sumaAsegurada: 75000 },
  '10': { nombre: '10 años', anios: 10, sumaAsegurada: 75000 }
}

export const PPR_PLAN_TABLE: Record<number, Record<PprPlanKey, PprPlanData>> = {
  20: {
    '65': { primaAnualUDI: 1604.73, meta65UDI: 102741 },
    '15': { primaAnualUDI: 3354.64, meta65UDI: 91423 },
    '10': { primaAnualUDI: 4450.31, meta65UDI: 81291 }
  },
  25: {
    '65': { primaAnualUDI: 1876.24, meta65UDI: 99527 },
    '15': { primaAnualUDI: 3495.90, meta65UDI: 85482 },
    '10': { primaAnualUDI: 4645.98, meta65UDI: 76367 }
  },
  30: {
    '65': { primaAnualUDI: 2255.39, meta65UDI: 96934 },
    '15': { primaAnualUDI: 3677.28, meta65UDI: 80407 },
    '10': { primaAnualUDI: 4899, meta65UDI: 73107 }
  },
  35: {
    '65': { primaAnualUDI: 2810.25, meta65UDI: 95499 },
    '15': { primaAnualUDI: 3951.31, meta65UDI: 77251 },
    '10': { primaAnualUDI: 5280.59, meta65UDI: 70917 }
  },
  40: {
    '65': { primaAnualUDI: 3551.44, meta65UDI: 94796 },
    '15': { primaAnualUDI: 4231.6, meta65UDI: 73429 },
    '10': { primaAnualUDI: 5662.19, meta65UDI: 68089 }
  },
  45: {
    '65': { primaAnualUDI: 4997.14, meta65UDI: 95685 },
    '15': { primaAnualUDI: 4789.67, meta65UDI: 73708 },
    '10': { primaAnualUDI: 6422.57, meta65UDI: 68975 }
  },
  50: {
    '65': { primaAnualUDI: 7326.41, meta65UDI: 95368 },
    '15': { primaAnualUDI: 5325.78, meta65UDI: 73327 },
    '10': { primaAnualUDI: 7160.71, meta65UDI: 68542 }
  }
}

export function getPprAgeRange(age: number): number {
  if (age >= 18 && age <= 20) return 20
  if (age <= 25) return 25
  if (age <= 30) return 30
  if (age <= 35) return 35
  if (age <= 40) return 40
  if (age <= 45) return 45
  if (age <= 50) return 50
  return 0
}
