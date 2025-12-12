/**
 * Script para modificar pólizas existentes para probar distintos cálculos de puntos
 * En lugar de crear nuevas pólizas, modificamos las existentes
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan variables de entorno')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const ESCENARIOS_TEST = [
  { nombre: 'GMM Sin Puntos', tipo: 'GMM', prima_mxn: 5000, puntos_esperados: 0 },
  { nombre: 'GMM Con Puntos', tipo: 'GMM', prima_mxn: 10000, puntos_esperados: 0.5 },
  { nombre: 'VI Sin Puntos', tipo: 'VI', prima_mxn: 10000, puntos_esperados: 0 },
  { nombre: 'VI Bronce (1)', tipo: 'VI', prima_mxn: 20000, puntos_esperados: 1 },
  { nombre: 'VI Plata (2)', tipo: 'VI', prima_mxn: 75000, puntos_esperados: 2 },
  { nombre: 'VI Oro (3)', tipo: 'VI', prima_mxn: 200000, puntos_esperados: 3 }
]

async function main() {
  console.log('🧪 Modificando póliza existente para probar escenarios\n')

  // 1. Obtener la póliza existente
  const polizaId = '4ca70746d-19a5-4b27-b4af-67ed052c9e83'
  const { data: poliza } = await supabase
    .from('polizas')
    .select('id, numero_poliza, cliente_id, producto_parametro_id')
    .eq('numero_poliza', 'bdfbdfrfsfs6165111')
    .maybeSingle()

  if (!poliza) {
    console.error('❌ No se encontró póliza bdfbdfrfsfs6165111')
    process.exit(1)
  }

  console.log(`✅ Póliza encontrada: ${poliza.numero_poliza} (${poliza.id.substring(0, 8)}...)\n`)

  // 2. Obtener candidato asociado
  const { data: candidato } = await supabase
    .from('candidatos')
    .select('id_candidato, candidato, email_agente')
    .eq('email_agente', 'orozco.jaime25@gmail.com')
    .maybeSingle()

  console.log(`👤 Candidato: ${candidato?.candidato || 'No encontrado'}\n`)

  // 3. Iterar por escenarios
  console.log('🔄 Probando diferentes escenarios...\n')
  console.log('='.repeat(80))

  for (const escenario of ESCENARIOS_TEST) {
    console.log(`\n📝 ${escenario.nombre}`)
    console.log(`   Prima: $${escenario.prima_mxn.toLocaleString()} MXN`)
    console.log(`   Puntos esperados: ${escenario.puntos_esperados}`)

    // Actualizar prima_mxn
    const { error: updateError } = await supabase
      .from('polizas')
      .update({ prima_mxn: escenario.prima_mxn })
      .eq('id', poliza.id)

    if (updateError) {
      console.log(`   ❌ Error al actualizar: ${updateError.message}`)
      continue
    }

    // Esperar triggers
    await new Promise(resolve => setTimeout(resolve, 500))

    // Llamar a recalc manualmente
    const { error: recalcError } = await supabase.rpc('recalc_puntos_poliza', {
      p_poliza_id: poliza.id,
      p_force: true
    })

    if (recalcError) {
      console.log(`   ⚠️  Error recalc: ${recalcError.message}`)
    }

    // Esperar más
    await new Promise(resolve => setTimeout(resolve, 500))

    // Verificar puntos
    const { data: polizaActualizada } = await supabase
      .from('polizas')
      .select('puntos_actuales, clasificacion_actual, poliza_puntos_cache(puntos_total, clasificacion)')
      .eq('id', poliza.id)
      .single()

    const puntosTabla = polizaActualizada?.puntos_actuales ?? 'null'
    const puntosCache = polizaActualizada?.poliza_puntos_cache?.puntos_total ?? 'null'

    const match = puntosTabla === escenario.puntos_esperados || puntosCache === escenario.puntos_esperados
    const icon = match ? '✅' : '⚠️ '

    console.log(`   ${icon} Resultado: tabla=${puntosTabla}, cache=${puntosCache}`)

    if (!match && puntosCache !== 'null') {
      // Sincronizar tabla con cache
      await supabase
        .from('polizas')
        .update({
          puntos_actuales: puntosCache,
          clasificacion_actual: polizaActualizada.poliza_puntos_cache.clasificacion
        })
        .eq('id', poliza.id)

      console.log(`   🔄 Sincronizado tabla con cache: ${puntosCache} puntos`)
    }

    // Consultar candidato con API
    if (candidato) {
      const { data: candidatoAPI } = await supabase
        .from('candidatos')
        .select('seg_gmm, seg_vida')
        .eq('id_candidato', candidato.id_candidato)
        .single()

      console.log(`   📊 Candidato actual: SEG_GMM=${candidatoAPI?.seg_gmm || 0}, SEG_VIDA=${candidatoAPI?.seg_vida || 0}`)
      console.log(`       (Los valores se calcularán automáticamente en GET /api/candidatos)`)
    }

    console.log('')
  }

  console.log('='.repeat(80))
  console.log('\n✅ Prueba completada')
  console.log(`\n💡 Para ver los valores calculados automáticamente:`)
  console.log(`   GET http://localhost:3000/api/candidatos?email_agente=orozco.jaime25@gmail.com\n`)
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err)
    process.exit(1)
  })
