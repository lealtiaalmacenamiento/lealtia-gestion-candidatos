/**
 * Script para insertar pólizas de prueba con diferentes cálculos de puntos
 * Cubre todos los escenarios: GMM (0, 0.5) y VI (0, 1, 2, 3 puntos)
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

// Escenarios de prueba
const ESCENARIOS = {
  GMM: [
    { nombre: 'GMM Baja (sin puntos)', prima_mxn: 5000, puntos_esperados: 0 },
    { nombre: 'GMM Media (0.5 puntos)', prima_mxn: 10000, puntos_esperados: 0.5 },
    { nombre: 'GMM Alta (0.5 puntos)', prima_mxn: 25000, puntos_esperados: 0.5 }
  ],
  VI: [
    { nombre: 'VI Muy Baja (sin puntos)', prima_mxn: 10000, puntos_esperados: 0 },
    { nombre: 'VI Bronce (1 punto)', prima_mxn: 20000, puntos_esperados: 1 },
    { nombre: 'VI Plata (2 puntos)', prima_mxn: 75000, puntos_esperados: 2 },
    { nombre: 'VI Oro (3 puntos)', prima_mxn: 200000, puntos_esperados: 3 }
  ]
}

async function obtenerProductos() {
  console.log('🔍 Buscando productos GMM y VI...')
  
  // Buscar product_types primero
  const { data: types } = await supabase
    .from('product_types')
    .select('id, code, name')
    .in('code', ['GMM', 'VI'])

  const gmmTypeId = types?.find(t => t.code === 'GMM')?.id
  const viTypeId = types?.find(t => t.code === 'VI')?.id

  if (!gmmTypeId || !viTypeId) {
    console.error('❌ No se encontraron product_types GMM o VI')
    process.exit(1)
  }

  // Buscar producto_parametros activos
  const { data: gmmParam } = await supabase
    .from('producto_parametros')
    .select('id, nombre_comercial, tipo_producto')
    .eq('product_type_id', gmmTypeId)
    .eq('activo', true)
    .limit(1)
    .maybeSingle()

  const { data: viParam } = await supabase
    .from('producto_parametros')
    .select('id, nombre_comercial, tipo_producto')
    .eq('product_type_id', viTypeId)
    .eq('activo', true)
    .limit(1)
    .maybeSingle()

  // Si no hay productos activos, usar cualquiera
  let gmm = gmmParam
  let vi = viParam

  if (!gmm) {
    const { data } = await supabase
      .from('producto_parametros')
      .select('id, nombre_comercial, tipo_producto')
      .eq('product_type_id', gmmTypeId)
      .limit(1)
      .maybeSingle()
    gmm = data
  }

  if (!vi) {
    const { data } = await supabase
      .from('producto_parametros')
      .select('id, nombre_comercial, tipo_producto')
      .eq('product_type_id', viTypeId)
      .limit(1)
      .maybeSingle()
    vi = data
  }

  if (!gmm || !vi) {
    console.error('❌ No se encontraron producto_parametros para GMM o VI')
    console.log('GMM Type ID:', gmmTypeId)
    console.log('VI Type ID:', viTypeId)
    process.exit(1)
  }

  console.log(`✅ GMM: ${gmm.nombre_comercial || gmm.tipo_producto} (${gmm.id.substring(0, 8)}...)`)
  console.log(`✅ VI: ${vi.nombre_comercial || vi.tipo_producto} (${vi.id.substring(0, 8)}...)\n`)

  return { gmm, vi }
}

async function obtenerOCrearAgenteTest() {
  console.log('🔍 Buscando agente de prueba...')

  // Usar el agente existente "orozco.jaime25@gmail.com"
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, id_auth, email, nombre')
    .eq('email', 'orozco.jaime25@gmail.com')
    .maybeSingle()

  if (!usuario || !usuario.id_auth) {
    console.error('❌ No se encontró usuario orozco.jaime25@gmail.com con id_auth')
    process.exit(1)
  }

  console.log(`✅ Agente: ${usuario.nombre || usuario.email} (${usuario.id_auth.substring(0, 8)}...)`)

  // Buscar cliente existente del agente
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, primer_nombre, activo')
    .eq('asesor_id', usuario.id_auth)
    .eq('activo', true)
    .limit(1)
    .maybeSingle()

  if (!cliente) {
    console.error('❌ No se encontró cliente activo para este agente')
    process.exit(1)
  }

  console.log(`✅ Cliente existente: ${cliente.primer_nombre} (${cliente.id.substring(0, 8)}...)\n`)

  return { usuario, cliente }
}

async function crearCliente(asesorId, nombre) {
  console.log(`   Creando cliente: ${nombre}...`)

  const { data: cliente, error } = await supabase
    .from('clientes')
    .insert({
      asesor_id: asesorId,
      primer_nombre: nombre,
      primer_apellido: 'Test',
      correo: `${nombre.toLowerCase().replace(/\s+/g, '_')}_test@example.com`,
      telefono_celular: '5555555555',
      activo: true
    })
    .select()
    .single()

  if (error) {
    console.error(`   ❌ Error al crear cliente: ${error.message}`)
    return null
  }

  console.log(`   ✅ Cliente creado: ${cliente.id.substring(0, 8)}...`)
  return cliente
}

async function crearPoliza(clienteId, productoId, escenario, index) {
  const numeroPoliza = `TEST-${Date.now()}-${index}`
  const fechaHoy = new Date().toISOString().split('T')[0]
  
  console.log(`   Creando póliza: ${escenario.nombre}`)
  console.log(`     Prima: $${escenario.prima_mxn.toLocaleString()} MXN`)
  console.log(`     Puntos esperados: ${escenario.puntos_esperados}`)

  const { data: poliza, error } = await supabase
    .from('polizas')
    .insert({
      cliente_id: clienteId,
      producto_parametro_id: productoId,
      numero_poliza: numeroPoliza,
      estatus: 'EN_VIGOR',
      fecha_emision: fechaHoy,
      fecha_renovacion: fechaHoy,
      forma_pago: 'MODO_DIRECTO',
      prima_input: escenario.prima_mxn,
      prima_moneda: 'MXN',
      prima_mxn: escenario.prima_mxn,
      periodicidad_pago: 'A'
    })
    .select()
    .single()

  if (error) {
    console.error(`   ❌ Error al crear póliza: ${error.message}`)
    return null
  }

  console.log(`   ✅ Póliza creada: ${poliza.numero_poliza}`)
  return poliza
}

async function recalcularPuntos(polizaId) {
  // Llamar a la función de Supabase para recalcular puntos
  const { data, error } = await supabase.rpc('recalc_puntos_poliza', {
    p_poliza_id: polizaId,
    p_force: true
  })

  if (error) {
    console.error(`   ⚠️  Error al recalcular puntos: ${error.message}`)
    return false
  }

  return true
}

async function verificarPuntos(polizaId, puntosEsperados) {
  const { data: poliza } = await supabase
    .from('polizas')
    .select('numero_poliza, puntos_actuales, clasificacion_actual, poliza_puntos_cache(puntos_total, clasificacion)')
    .eq('id', polizaId)
    .single()

  const puntosActuales = poliza?.puntos_actuales ?? 0
  const puntosCache = poliza?.poliza_puntos_cache?.puntos_total ?? 0

  const coincide = puntosActuales === puntosEsperados || puntosCache === puntosEsperados

  if (coincide) {
    console.log(`   ✅ Puntos verificados: ${puntosActuales} (esperado: ${puntosEsperados})`)
  } else {
    console.log(`   ⚠️  Puntos no coinciden: ${puntosActuales} (esperado: ${puntosEsperados})`)
    console.log(`      Cache: ${puntosCache}`)
  }

  return { poliza, coincide }
}

async function main() {
  console.log('🚀 Iniciando creación de pólizas de prueba\n')
  console.log('=' .repeat(70))

  // 1. Obtener productos
  const { gmm, vi } = await obtenerProductos()

  // 2. Obtener agente y cliente
  const { usuario: agente, cliente } = await obtenerOCrearAgenteTest()

  const resultados = {
    gmm: [],
    vi: []
  }

  // 3. Crear pólizas GMM
  console.log('\n📋 CREANDO PÓLIZAS GMM')
  console.log('=' .repeat(70))

  for (let i = 0; i < ESCENARIOS.GMM.length; i++) {
    const escenario = ESCENARIOS.GMM[i]
    const poliza = await crearPoliza(cliente.id, gmm.id, escenario, `GMM${i}`)
    
    if (poliza) {
      // Esperar un poco para que los triggers se ejecuten
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const { poliza: polizaVerificada, coincide } = await verificarPuntos(poliza.id, escenario.puntos_esperados)
      
      resultados.gmm.push({
        escenario: escenario.nombre,
        numero: poliza.numero_poliza,
        puntos_esperados: escenario.puntos_esperados,
        puntos_actuales: polizaVerificada?.puntos_actuales,
        coincide
      })
    }
    
    console.log('')
  }

  // 4. Crear pólizas VI
  console.log('\n📋 CREANDO PÓLIZAS VI')
  console.log('=' .repeat(70))

  for (let i = 0; i < ESCENARIOS.VI.length; i++) {
    const escenario = ESCENARIOS.VI[i]
    const poliza = await crearPoliza(cliente.id, vi.id, escenario, `VI${i}`)
    
    if (poliza) {
      // Esperar un poco para que los triggers se ejecuten
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const { poliza: polizaVerificada, coincide } = await verificarPuntos(poliza.id, escenario.puntos_esperados)
      
      resultados.vi.push({
        escenario: escenario.nombre,
        numero: poliza.numero_poliza,
        puntos_esperados: escenario.puntos_esperados,
        puntos_actuales: polizaVerificada?.puntos_actuales,
        coincide
      })
    }
    
    console.log('')
  }

  // 5. Resumen final
  console.log('\n📊 RESUMEN DE RESULTADOS')
  console.log('=' .repeat(70))
  
  console.log('\n🔷 GMM:')
  for (const r of resultados.gmm) {
    const icon = r.coincide ? '✅' : '❌'
    console.log(`${icon} ${r.escenario}: ${r.puntos_actuales ?? 'null'} / ${r.puntos_esperados} puntos`)
  }

  console.log('\n🔶 VI:')
  for (const r of resultados.vi) {
    const icon = r.coincide ? '✅' : '❌'
    console.log(`${icon} ${r.escenario}: ${r.puntos_actuales ?? 'null'} / ${r.puntos_esperados} puntos`)
  }

  // 6. Verificar candidato
  console.log('\n\n👤 VERIFICANDO CANDIDATO')
  console.log('=' .repeat(70))

  const { data: candidato } = await supabase
    .from('candidatos')
    .select('id_candidato, candidato, email_agente, seg_gmm, seg_vida')
    .eq('email_agente', agente.email)
    .maybeSingle()

  if (candidato) {
    const totalGmmEsperado = resultados.gmm.reduce((sum, r) => sum + r.puntos_esperados, 0)
    const totalViEsperado = resultados.vi.reduce((sum, r) => sum + r.puntos_esperados, 0)

    console.log(`\nCandidato: ${candidato.candidato}`)
    console.log(`Email agente: ${candidato.email_agente}`)
    console.log(`\nValores en BD candidatos:`)
    console.log(`  SEG_GMM: ${candidato.seg_gmm}`)
    console.log(`  SEG_VIDA: ${candidato.seg_vida}`)
    console.log(`\nValores esperados (nuevas pólizas):`)
    console.log(`  SEG_GMM: +${totalGmmEsperado} (total esperado al hacer GET: ${candidato.seg_gmm + totalGmmEsperado})`)
    console.log(`  SEG_VIDA: +${totalViEsperado} (total esperado al hacer GET: ${candidato.seg_vida + totalViEsperado})`)
    console.log(`\n💡 Los valores se calculan automáticamente en GET /api/candidatos`)
  } else {
    console.log('⚠️  No se encontró candidato con email_agente:', agente.email)
  }

  console.log('\n' + '=' .repeat(70))
  console.log('✅ Proceso completado\n')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error fatal:', err)
    process.exit(1)
  })
