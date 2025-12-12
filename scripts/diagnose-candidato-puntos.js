/**
 * Script de diagnóstico: Analizar por qué candidatos tienen 0 puntos
 * Revisa pólizas, primas y cálculo de puntos
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

async function main() {
  console.log('🔍 Diagnóstico de SEG_GMM y SEG_VIDA\n')

  // 1. Obtener candidatos con email_agente
  const { data: candidatos } = await supabase
    .from('candidatos')
    .select('id_candidato, candidato, email_agente, seg_gmm, seg_vida')
    .not('email_agente', 'is', null)
    .eq('eliminado', false)
    .order('id_candidato')

  console.log(`📋 Total candidatos con email_agente: ${candidatos?.length || 0}\n`)

  for (const cand of candidatos || []) {
    const email = cand.email_agente.toLowerCase()
    
    // 2. Buscar usuario
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('id, id_auth, nombre, activo')
      .eq('email', email)
      .maybeSingle()

    if (!usuario) {
      console.log(`❌ ${cand.candidato} (${email}) - Sin usuario`)
      continue
    }

    if (!usuario.activo) {
      console.log(`⚠️  ${cand.candidato} (${email}) - Usuario inactivo`)
      continue
    }

    if (!usuario.id_auth) {
      console.log(`⚠️  ${cand.candidato} (${email}) - Usuario sin id_auth`)
      continue
    }

    // 3. Buscar clientes del asesor
    const { data: clientes } = await supabase
      .from('clientes')
      .select('id, primer_nombre, primer_apellido, activo')
      .eq('asesor_id', usuario.id_auth)

    if (!clientes || clientes.length === 0) {
      console.log(`ℹ️  ${cand.candidato} - Sin clientes asignados`)
      continue
    }

    const clientesActivos = clientes.filter(c => c.activo)
    const clientesInactivos = clientes.length - clientesActivos.length

    // 4. Buscar pólizas
    const { data: polizas } = await supabase
      .from('polizas')
      .select(`
        id,
        numero_poliza,
        estatus,
        prima_input,
        prima_moneda,
        prima_mxn,
        puntos_actuales,
        clasificacion_actual,
        producto_parametros!inner(
          nombre,
          product_types!inner(code, name)
        ),
        poliza_puntos_cache(
          puntos_total,
          clasificacion,
          prima_anual_snapshot
        ),
        clientes!inner(asesor_id, activo)
      `)
      .eq('clientes.asesor_id', usuario.id_auth)

    if (!polizas || polizas.length === 0) {
      console.log(`ℹ️  ${cand.candidato} - ${clientesActivos.length} clientes, 0 pólizas`)
      continue
    }

    // 5. Analizar pólizas
    const polizasEnVigor = polizas.filter(p => p.estatus === 'EN_VIGOR' && p.clientes.activo)
    const polizasAnuladas = polizas.filter(p => p.estatus === 'ANULADA')
    const polizasClienteInactivo = polizas.filter(p => !p.clientes.activo)

    let seg_gmm = 0
    let seg_vida = 0
    const detalle = []

    for (const pol of polizasEnVigor) {
      const productCode = pol.producto_parametros?.product_types?.code?.toUpperCase() || 'UNKNOWN'
      const productName = pol.producto_parametros?.product_types?.name || 'Sin nombre'
      const puntos = pol.puntos_actuales ?? 0
      const puntosCache = pol.poliza_puntos_cache?.puntos_total ?? null
      const primaInput = pol.prima_input ?? 0
      const primaMxn = pol.prima_mxn ?? pol.poliza_puntos_cache?.prima_anual_snapshot ?? 0
      const clasificacion = pol.clasificacion_actual || pol.poliza_puntos_cache?.clasificacion || 'CERO'

      detalle.push({
        numero: pol.numero_poliza || pol.id.substring(0, 8),
        producto: productCode,
        nombreProducto: productName,
        primaInput,
        moneda: pol.prima_moneda || 'MXN',
        primaMxn: primaMxn.toFixed(2),
        puntos,
        puntosCache,
        clasificacion
      })

      if (productCode === 'GMM') {
        seg_gmm += puntos
      } else if (productCode === 'VI') {
        seg_vida += puntos
      }
    }

    seg_gmm = Number(seg_gmm.toFixed(1))
    seg_vida = Math.round(seg_vida)

    const deberíaTenerPuntos = seg_gmm > 0 || seg_vida > 0
    const tienePuntos = cand.seg_gmm > 0 || cand.seg_vida > 0

    // Mostrar solo si es interesante
    if (polizasEnVigor.length > 0) {
      console.log(`\n${'='.repeat(70)}`)
      console.log(`📝 ${cand.candidato} (ID ${cand.id_candidato})`)
      console.log(`   Email: ${email}`)
      console.log(`   Usuario: ${usuario.nombre || 'Sin nombre'} (id_auth: ${usuario.id_auth.substring(0, 8)}...)`)
      console.log(`   Clientes: ${clientesActivos.length} activos${clientesInactivos > 0 ? `, ${clientesInactivos} inactivos` : ''}`)
      console.log(`   Pólizas totales: ${polizas.length}`)
      console.log(`     • EN_VIGOR + cliente activo: ${polizasEnVigor.length}`)
      if (polizasAnuladas.length > 0) console.log(`     • ANULADAS: ${polizasAnuladas.length}`)
      if (polizasClienteInactivo.length > 0) console.log(`     • Cliente inactivo: ${polizasClienteInactivo.length}`)

      console.log(`\n   📊 Pólizas EN_VIGOR:`)
      for (const d of detalle) {
        console.log(`   • ${d.numero}`)
        console.log(`     Producto: ${d.producto} - ${d.nombreProducto}`)
        console.log(`     Prima: ${d.primaInput} ${d.moneda} (MXN: $${d.primaMxn})`)
        console.log(`     Puntos tabla: ${d.puntos} | Cache: ${d.puntosCache ?? 'null'} | Clasificación: ${d.clasificacion}`)
        
        // Diagnóstico
        if (d.puntos === 0 && parseFloat(d.primaMxn) > 0) {
          if (d.producto === 'GMM' && parseFloat(d.primaMxn) >= 7500) {
            console.log(`     ⚠️  DEBERÍA TENER 0.5 puntos (prima ≥ $7,500)`)
          } else if (d.producto === 'VI' && parseFloat(d.primaMxn) >= 15000) {
            console.log(`     ⚠️  DEBERÍA TENER puntos (prima ≥ $15,000)`)
          } else {
            console.log(`     ℹ️  Prima muy baja para puntos (${d.producto})`)
          }
        }
      }

      console.log(`\n   💰 Totales calculados:`)
      console.log(`     SEG_GMM: ${seg_gmm}`)
      console.log(`     SEG_VIDA: ${seg_vida}`)

      console.log(`\n   📋 Valores en BD candidatos:`)
      console.log(`     SEG_GMM: ${cand.seg_gmm}`)
      console.log(`     SEG_VIDA: ${cand.seg_vida}`)

      if (deberíaTenerPuntos && !tienePuntos) {
        console.log(`\n   🔴 PROBLEMA: Debería tener puntos pero tiene 0 en BD`)
      } else if (!deberíaTenerPuntos && tienePuntos) {
        console.log(`\n   ⚠️  ADVERTENCIA: Tiene puntos en BD pero no debería (según pólizas actuales)`)
      } else if (seg_gmm !== cand.seg_gmm || seg_vida !== cand.seg_vida) {
        console.log(`\n   ⚠️  DIFERENCIA: Valores calculados ≠ valores en BD`)
      } else {
        console.log(`\n   ✅ OK: Valores coinciden`)
      }
    }
  }

  console.log(`\n${'='.repeat(70)}\n`)
  console.log(`✅ Diagnóstico completado\n`)
  console.log(`💡 Notas:`)
  console.log(`   • Solo pólizas EN_VIGOR con clientes activos cuentan para puntos`)
  console.log(`   • GMM requiere prima ≥ $7,500 MXN para 0.5 puntos`)
  console.log(`   • VI requiere prima ≥ $15,000 MXN para puntos (1, 2 o 3)`)
  console.log(`   • Si puntos_actuales = 0, puede necesitar recalc_puntos_poliza()`)
  console.log(`   • Los valores en candidatos.seg_gmm/seg_vida se calculan en GET`)
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
