/**
 * Script para analizar fechas de candidatos y determinar rangos óptimos para alertas
 */
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_ENV_FILES = ['.env.local', '.env']

for (const candidate of DEFAULT_ENV_FILES) {
  const absolutePath = path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate)
  if (existsSync(absolutePath)) {
    loadEnv({ path: absolutePath, override: true })
    break
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan variables SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
})

async function analyzeDates() {
  console.log('🔍 Consultando candidatos...\n')

  const { data: candidatos, error } = await supabase
    .from('candidatos')
    .select(`
      id_candidato,
      candidato,
      periodo_para_registro_y_envio_de_documentos,
      capacitacion_cedula_a1,
      fecha_tentativa_de_examen,
      periodo_para_ingresar_folio_oficina_virtual,
      periodo_para_playbook,
      pre_escuela_sesion_unica_de_arranque,
      fecha_limite_para_presentar_curricula_cdp,
      inicio_escuela_fundamental,
      etapas_completadas
    `)
    .limit(1000)

  if (error) {
    console.error('❌ Error consultando candidatos:', error)
    process.exit(1)
  }

  if (!candidatos || candidatos.length === 0) {
    console.log('⚠️ No hay candidatos en la base de datos')
    return
  }

  console.log(`📊 Total candidatos: ${candidatos.length}\n`)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const phases = [
    { key: 'periodo_para_registro_y_envio_de_documentos', name: 'Registro y envío' },
    { key: 'capacitacion_cedula_a1', name: 'Capacitación A1' },
    { key: 'fecha_tentativa_de_examen', name: 'Examen' },
    { key: 'periodo_para_ingresar_folio_oficina_virtual', name: 'Folio OV' },
    { key: 'periodo_para_playbook', name: 'Playbook' },
    { key: 'pre_escuela_sesion_unica_de_arranque', name: 'Pre-escuela' },
    { key: 'fecha_limite_para_presentar_curricula_cdp', name: 'Currícula CDP' },
    { key: 'inicio_escuela_fundamental', name: 'Escuela Fundamental' }
  ]

  // Estadísticas por fase
  for (const phase of phases) {
    const alerts = {
      vencidos: 0,
      proximos1_3: 0,
      proximos4_7: 0,
      proximos8_14: 0,
      proximos15_30: 0,
      futuro: 0,
      total: 0,
      pendientes: 0
    }

    for (const candidato of candidatos) {
      const dateStr = candidato[phase.key as keyof typeof candidato]
      if (!dateStr || typeof dateStr !== 'string') continue

      alerts.total++

      // Verificar si está completada
      const etapasCompletadas = candidato.etapas_completadas as any
      const isCompleted = etapasCompletadas?.[phase.key]?.completed === true
      
      if (!isCompleted) {
        alerts.pendientes++
      }

      // Parsear fecha
      let phaseDate: Date | null = null
      
      // ISO format
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        phaseDate = new Date(dateStr)
      } else {
        // Formato español - tomar primer día
        const match = dateStr.match(/(\d{1,2})/)
        if (match) {
          const day = parseInt(match[1], 10)
          const mesesMap: Record<string, number> = {
            'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
            'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
            'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
          }
          const monthMatch = dateStr.match(/(\w+)$/i)
          if (monthMatch) {
            const monthName = monthMatch[1].toLowerCase()
            const monthIndex = mesesMap[monthName]
            if (monthIndex !== undefined) {
              phaseDate = new Date(today.getFullYear(), monthIndex, day)
            }
          }
        }
      }

      if (!phaseDate || isNaN(phaseDate.getTime())) continue

      const diffMs = phaseDate.getTime() - today.getTime()
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays < 0) {
        alerts.vencidos++
      } else if (diffDays <= 3) {
        alerts.proximos1_3++
      } else if (diffDays <= 7) {
        alerts.proximos4_7++
      } else if (diffDays <= 14) {
        alerts.proximos8_14++
      } else if (diffDays <= 30) {
        alerts.proximos15_30++
      } else {
        alerts.futuro++
      }
    }

    if (alerts.total > 0) {
      console.log(`\n📌 ${phase.name}`)
      console.log(`   Total con fecha: ${alerts.total}`)
      console.log(`   Pendientes (no completados): ${alerts.pendientes}`)
      console.log(`   🔴 Vencidos: ${alerts.vencidos}`)
      console.log(`   🟠 1-3 días: ${alerts.proximos1_3}`)
      console.log(`   🟡 4-7 días: ${alerts.proximos4_7}`)
      console.log(`   🔵 8-14 días: ${alerts.proximos8_14}`)
      console.log(`   ⚪ 15-30 días: ${alerts.proximos15_30}`)
      console.log(`   ⚫ Más de 30 días: ${alerts.futuro}`)
    }
  }

  console.log('\n✅ Análisis completado')
}

analyzeDates().catch(console.error)
