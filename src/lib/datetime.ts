// Utilidades de fecha/hora centradas en CDMX
// Mantiene almacenamiento en UTC y formatea a America/Mexico_City.
// Incluye fallback manual si Intl no aplica la zona (entornos sin ICU completo).

const MX_TZ = 'America/Mexico_City'
const FIXED_OFFSET_HOURS = 6 // UTC = local + 6 (sin DST post 2022)

function pad(n:number){ return n.toString().padStart(2,'0') }

export function formatFechaHoraCDMX(iso?: string|null, opts?: { incluirFecha?: boolean }){
  if(!iso) return ''
  let d: Date
  try { d = new Date(iso) } catch { return '' }
  if(isNaN(d.getTime())) return ''
  let fecha=''
  let hora=''
  try {
    if(opts?.incluirFecha!==false){
      fecha = new Intl.DateTimeFormat('es-MX',{ timeZone: MX_TZ, day:'2-digit', month:'2-digit'}).format(d)
    }
    hora = new Intl.DateTimeFormat('es-MX',{ timeZone: MX_TZ, hour:'2-digit', minute:'2-digit', hour12:false }).format(d)
    // Validación: si Intl no aplicó desplazamiento (fallback a UTC) la hora coincidirá con getUTCHours
    const expectedLocalHour = (d.getUTCHours() - FIXED_OFFSET_HOURS + 24) % 24
    const parsedHour = parseInt(hora.slice(0,2),10)
    if(parsedHour === d.getUTCHours() && parsedHour !== expectedLocalHour){
      // Fallback manual restando offset
      const manual = new Date(d.getTime() - FIXED_OFFSET_HOURS*3600*1000)
      if(opts?.incluirFecha!==false){
        fecha = `${pad(manual.getUTCDate())}/${pad(manual.getUTCMonth()+1)}`
      }
      hora = `${pad(manual.getUTCHours())}:${pad(manual.getUTCMinutes())}`
    }
  } catch {
    const manual = new Date(d.getTime() - FIXED_OFFSET_HOURS*3600*1000)
    if(opts?.incluirFecha!==false){
      fecha = `${pad(manual.getUTCDate())}/${pad(manual.getUTCMonth()+1)}`
    }
    hora = `${pad(manual.getUTCHours())}:${pad(manual.getUTCMinutes())}`
  }
  return opts?.incluirFecha===false? hora : `${fecha} ${hora}`.trim()
}

export function formatSoloHoraCDMX(iso?:string|null){ return formatFechaHoraCDMX(iso,{incluirFecha:false}) }
