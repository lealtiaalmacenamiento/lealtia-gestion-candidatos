#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' })

const pg = require('pg')

const mainDbUrl = process.env.MainDATABASE_URL
const client = new pg.Client({ connectionString: mainDbUrl })

// Copiar la función de sincronización del código
function obtenerSemanaIso(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const semana = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return { anio: d.getUTCFullYear(), semana }
}

function parseTimezoneComponents(date) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    const parts = formatter.formatToParts(date)
    const lookup = (type) => parts.find((p) => p.type === type)?.value
    const year = Number(lookup('year'))
    const month = Number(lookup('month'))
    const day = Number(lookup('day'))
    const hour = Number(lookup('hour'))
    const minute = Number(lookup('minute'))
    const second = Number(lookup('second'))
    if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
      return null
    }
    const zonedDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    return { zonedDate, hour: hour.toString().padStart(2, '0') }
  } catch {
    return null
  }
}

function semanaDesdeNumero(anio, semana) {
  const simple = new Date(Date.UTC(anio, 0, 1 + (semana - 1) * 7))
  const dow = simple.getUTCDay()
  const isoWeekStart = new Date(simple)
  if (dow <= 4) {
    isoWeekStart.setUTCDate(simple.getUTCDate() - dow + 1)
  } else {
    isoWeekStart.setUTCDate(simple.getUTCDate() + 8 - dow)
  }
  return { inicio: isoWeekStart }
}

function dayAndHourFromIso(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parsed = parseTimezoneComponents(date)
  if (!parsed) return null
  const { zonedDate, hour } = parsed
  const { anio, semana } = obtenerSemanaIso(zonedDate)
  const semanaInfo = semanaDesdeNumero(anio, semana)
  const diffMs = zonedDate.getTime() - semanaInfo.inicio.getTime()
  const day = Math.max(0, Math.min(6, Math.floor(diffMs / 86400000)))
  return { day, hour, anio, semana }
}

async function syncCitaToPlanificacion(cita) {
  console.log(`\n📋 Procesando cita #${cita.id}:`)
  console.log(`   Agente ID auth: ${cita.agente_id}`)
  console.log(`   Inicio: ${cita.inicio}`)
  console.log(`   Prospecto: ${cita.prospecto_id || 'sin prospecto'}`)
  
  // Obtener el ID numérico del agente
  const usuarioResult = await client.query(
    'SELECT id, nombre, email FROM usuarios WHERE id_auth = $1',
    [cita.agente_id]
  )
  
  if (usuarioResult.rows.length === 0) {
    console.log(`   ❌ No se encontró usuario con id_auth=${cita.agente_id}`)
    return { success: false, error: 'Usuario no encontrado' }
  }
  
  const usuario = usuarioResult.rows[0]
  console.log(`   ✅ Usuario encontrado: ${usuario.nombre || usuario.email} (id=${usuario.id})`)
  
  const meta = dayAndHourFromIso(cita.inicio)
  if (!meta) {
    console.log(`   ❌ No se pudo parsear la fecha`)
    return { success: false, error: 'Fecha inválida' }
  }
  
  console.log(`   📅 Semana ${meta.semana}/${meta.anio}, día ${meta.day}, hora ${meta.hour}`)
  
  // Obtener prospecto si existe
  let prospectoNombre = null
  if (cita.prospecto_id) {
    const prospectoResult = await client.query(
      'SELECT nombre FROM prospectos WHERE id = $1',
      [cita.prospecto_id]
    )
    prospectoNombre = prospectoResult.rows[0]?.nombre || null
    console.log(`   👤 Prospecto: ${prospectoNombre}`)
  }
  
  // Buscar plan existente
  const planResult = await client.query(
    'SELECT id, bloques FROM planificaciones WHERE agente_id = $1 AND semana_iso = $2 AND anio = $3',
    [usuario.id, meta.semana, meta.anio]
  )
  
  const buildBlock = () => ({
    day: meta.day,
    hour: meta.hour,
    activity: 'CITAS',
    origin: 'auto',
    prospecto_id: cita.prospecto_id ?? undefined,
    prospecto_nombre: prospectoNombre ?? undefined,
    prospecto_estado: 'con_cita',
    confirmada: false,
    agenda_cita_id: cita.id
  })
  
  if (planResult.rows.length === 0) {
    console.log(`   ➕ Creando nuevo plan...`)
    try {
      await client.query(
        'INSERT INTO planificaciones (agente_id, semana_iso, anio, bloques, prima_anual_promedio, porcentaje_comision, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [usuario.id, meta.semana, meta.anio, JSON.stringify([buildBlock()]), 0, 0, new Date().toISOString()]
      )
      console.log(`   ✅ Plan creado con cita sincronizada`)
      return { success: true, action: 'created' }
    } catch (err) {
      console.log(`   ❌ Error creando plan: ${err.message}`)
      return { success: false, error: err.message }
    }
  }
  
  // Actualizar plan existente
  const plan = planResult.rows[0]
  const bloques = Array.isArray(plan.bloques) ? plan.bloques : []
  let updated = false
  const nextBlocks = bloques.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw
    if (raw.day === meta.day && raw.hour === meta.hour && raw.activity === 'CITAS') {
      updated = true
      return {
        ...raw,
        origin: raw.origin ?? 'manual',
        prospecto_id: cita.prospecto_id ?? raw.prospecto_id,
        prospecto_nombre: prospectoNombre ?? raw.prospecto_nombre,
        prospecto_estado: 'con_cita',
        confirmada: raw.confirmada ?? false,
        agenda_cita_id: cita.id
      }
    }
    return raw
  })
  
  if (!updated) {
    nextBlocks.push(buildBlock())
  }
  
  console.log(`   🔄 Actualizando plan existente (${updated ? 'modificado' : 'agregado'})...`)
  try {
    await client.query(
      'UPDATE planificaciones SET bloques = $1, updated_at = $2 WHERE id = $3',
      [JSON.stringify(nextBlocks), new Date().toISOString(), plan.id]
    )
    console.log(`   ✅ Cita sincronizada exitosamente`)
    return { success: true, action: 'updated' }
  } catch (err) {
    console.log(`   ❌ Error actualizando plan: ${err.message}`)
    return { success: false, error: err.message }
  }
}

async function main() {
  console.log('🔍 Buscando citas confirmadas en MAIN...\n')
  
  await client.connect()
  
  try {
    // Obtener todas las citas confirmadas
    const citasResult = await client.query(
      "SELECT * FROM citas WHERE estado = 'confirmada' ORDER BY inicio ASC"
    )
    
    const citas = citasResult.rows
    console.log(`📊 Encontradas ${citas.length} citas confirmadas en MAIN\n`)
    
    const results = {
      success: 0,
      failed: 0,
      errors: []
    }
    
    for (const cita of citas) {
      const result = await syncCitaToPlanificacion(cita)
      if (result.success) {
        results.success++
      } else {
        results.failed++
        results.errors.push({ citaId: cita.id, error: result.error })
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log(`✅ Sincronizadas exitosamente: ${results.success}`)
    console.log(`❌ Fallidas: ${results.failed}`)
    
    if (results.errors.length > 0) {
      console.log('\n❌ Errores:')
      results.errors.forEach(e => {
        console.log(`   Cita #${e.citaId}: ${e.error}`)
      })
    }
  } finally {
    await client.end()
  }
}

main()
