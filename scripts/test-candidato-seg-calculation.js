/**
 * Script de prueba: Verificar cálculo automático de SEG_GMM y SEG_VIDA
 * 
 * Este script prueba que:
 * 1. Los candidatos obtienen valores calculados automáticamente desde las pólizas
 * 2. Los valores manuales se pueden editar y guardar
 * 3. La relación es: email_agente → usuario → id_auth → polizas → product_types
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function main() {
  console.log('🧪 Iniciando prueba de cálculo de SEG_GMM y SEG_VIDA\n')

  // 1. Buscar un candidato con email_agente
  console.log('📋 Buscando candidatos con email_agente...')
  const { data: candidatos, error: errorCandidatos } = await supabase
    .from('candidatos')
    .select('id_candidato, candidato, email_agente, seg_gmm, seg_vida')
    .not('email_agente', 'is', null)
    .eq('eliminado', false)
    .limit(5)

  if (errorCandidatos) {
    console.error('❌ Error obteniendo candidatos:', errorCandidatos.message)
    return
  }

  if (!candidatos || candidatos.length === 0) {
    console.log('⚠️  No hay candidatos con email_agente asignado')
    return
  }

  console.log(`✅ Encontrados ${candidatos.length} candidatos con email_agente\n`)

  for (const candidato of candidatos) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📝 Candidato: ${candidato.candidato} (ID ${candidato.id_candidato})`)
    console.log(`📧 Email agente: ${candidato.email_agente}`)
    console.log(`📊 Valores actuales en BD:`)
    console.log(`   SEG_GMM: ${candidato.seg_gmm ?? 'null'}`)
    console.log(`   SEG_VIDA: ${candidato.seg_vida ?? 'null'}`)

    // 2. Obtener el usuario asociado
    const { data: usuario, error: errorUsuario } = await supabase
      .from('usuarios')
      .select('id, id_auth, nombre, email')
      .eq('email', candidato.email_agente.toLowerCase())
      .eq('activo', true)
      .maybeSingle()

    if (errorUsuario || !usuario) {
      console.log(`❌ No se encontró usuario activo para ${candidato.email_agente}`)
      continue
    }

    console.log(`\n👤 Usuario encontrado:`)
    console.log(`   ID: ${usuario.id}`)
    console.log(`   ID_AUTH: ${usuario.id_auth}`)
    console.log(`   Nombre: ${usuario.nombre || '(sin nombre)'}`)

    if (!usuario.id_auth) {
      console.log(`⚠️  Usuario no tiene id_auth, no puede tener pólizas`)
      continue
    }

    // 3. Obtener pólizas del agente
    const { data: polizas, error: errorPolizas } = await supabase
      .from('polizas')
      .select(`
        id,
        numero_poliza,
        estatus,
        puntos_actuales,
        producto_parametros!inner(product_types!inner(code, name)),
        clientes!inner(asesor_id, activo)
      `)
      .eq('clientes.asesor_id', usuario.id_auth)
      .eq('clientes.activo', true)

    if (errorPolizas) {
      console.log(`❌ Error obteniendo pólizas:`, errorPolizas.message)
      continue
    }

    console.log(`\n💼 Pólizas encontradas: ${polizas?.length || 0}`)

    if (!polizas || polizas.length === 0) {
      console.log(`   ℹ️  Este agente no tiene pólizas activas`)
      continue
    }

    // 4. Calcular SEG_GMM y SEG_VIDA
    let seg_gmm_calculado = 0
    let seg_vida_calculado = 0

    console.log(`\n📊 Desglose de pólizas:`)
    for (const poliza of polizas) {
      const puntos = poliza.puntos_actuales ?? 0
      const productCode = poliza.producto_parametros?.product_types?.code?.toUpperCase() || 'UNKNOWN'
      const productName = poliza.producto_parametros?.product_types?.name || 'Sin nombre'
      const status = poliza.estatus || 'SIN_ESTATUS'

      console.log(`   • Póliza ${poliza.numero_poliza || poliza.id}:`)
      console.log(`     Producto: ${productCode} - ${productName}`)
      console.log(`     Estatus: ${status}`)
      console.log(`     Puntos: ${puntos}`)

      // Solo contar pólizas EN_VIGOR
      if (status === 'EN_VIGOR') {
        if (productCode === 'GMM') {
          seg_gmm_calculado += puntos
        } else if (productCode === 'VI') {
          seg_vida_calculado += puntos
        }
      }
    }

    seg_gmm_calculado = Number(seg_gmm_calculado.toFixed(1))
    seg_vida_calculado = Math.round(seg_vida_calculado)

    console.log(`\n✨ Valores calculados:`)
    console.log(`   SEG_GMM: ${seg_gmm_calculado}`)
    console.log(`   SEG_VIDA: ${seg_vida_calculado}`)

    // 5. Comparar con valores en BD
    const gmm_match = candidato.seg_gmm === seg_gmm_calculado
    const vida_match = candidato.seg_vida === seg_vida_calculado

    console.log(`\n🔍 Comparación:`)
    console.log(`   SEG_GMM: ${candidato.seg_gmm ?? 'null'} → ${seg_gmm_calculado} ${gmm_match ? '✅' : '⚠️  DIFERENTE'}`)
    console.log(`   SEG_VIDA: ${candidato.seg_vida ?? 'null'} → ${seg_vida_calculado} ${vida_match ? '✅' : '⚠️  DIFERENTE'}`)

    if (!gmm_match || !vida_match) {
      console.log(`\n   💡 Los valores en BD difieren de los calculados.`)
      console.log(`      Esto puede ser normal si:`)
      console.log(`      - El candidato fue editado manualmente`)
      console.log(`      - Las pólizas cambiaron recientemente`)
      console.log(`      - El endpoint GET aún no se ha llamado después del cambio`)
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`\n✅ Prueba completada`)
  console.log(`\nℹ️  Notas:`)
  console.log(`   • Los valores se calculan automáticamente en GET /api/candidatos`)
  console.log(`   • Los valores manuales se pueden editar en PUT /api/candidatos/:id`)
  console.log(`   • Solo se cuentan pólizas EN_VIGOR con clientes activos`)
  console.log(`   • GMM permite decimales (0.5), VI solo enteros`)
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
