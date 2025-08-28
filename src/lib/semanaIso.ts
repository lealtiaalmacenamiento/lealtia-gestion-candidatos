// Utilidades semana ISO y helpers fase 2
export interface SemanaIso { anio: number; semana: number; inicio: Date; fin: Date }

function startOfISOWeek(d: Date): Date { const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = dt.getUTCDay() || 7; if (day !== 1) dt.setUTCDate(dt.getUTCDate() - (day - 1)); return dt }

export function obtenerSemanaIso(fecha: Date = new Date()): SemanaIso {
  const temp = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()))
  // Jueves de la semana ISO define el año
  const thursday = new Date(temp)
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() || 7)))
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(),0,4))
  const semana = 1 + Math.round(((thursday.getTime() - firstThursday.getTime())/86400000 - 3 + ((firstThursday.getUTCDay()||7)))/7)
  const inicio = startOfISOWeek(temp)
  const fin = new Date(inicio); fin.setUTCDate(fin.getUTCDate()+6)
  return { anio: thursday.getUTCFullYear(), semana, inicio, fin }
}

export function formatearRangoSemana(sem: SemanaIso): string {
  const fmt = (d: Date)=> `${d.getUTCDate().toString().padStart(2,'0')}/${(d.getUTCMonth()+1).toString().padStart(2,'0')}`
  return `${fmt(sem.inicio)} - ${fmt(sem.fin)}`
}

// Obtener estructura SemanaIso desde año y número de semana ISO
export function semanaDesdeNumero(anio: number, semana: number): SemanaIso {
  // Basado en ISO: semana 1 es la que contiene el 4 de enero
  // Encontrar el jueves de la semana 1
  const fourthJan = new Date(Date.UTC(anio, 0, 4))
  const day = fourthJan.getUTCDay() || 7
  const week1Monday = new Date(fourthJan)
  if (day !== 1) week1Monday.setUTCDate(fourthJan.getUTCDate() - (day - 1))
  const inicio = new Date(week1Monday)
  inicio.setUTCDate(week1Monday.getUTCDate() + (semana - 1) * 7)
  const fin = new Date(inicio)
  fin.setUTCDate(inicio.getUTCDate() + 6)
  return { anio, semana, inicio, fin }
}
