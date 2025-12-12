/**
 * Script para calcular y asignar puntos manualmente a pólizas TEST
 * Inserta en cache y actualiza puntos_actuales
 */

const { Client } = require('pg')
require('dotenv').config({ path: '.env.local' })

const DEV_DB_URL = process.env.DevDATABASE_URL

if (!DEV_DB_URL) {
  console.error('❌ Falta DevDATABASE_URL en .env.local')
  process.exit(1)
}

const client = new Client({ connectionString: DEV_DB_URL })

function calcularPuntosGMM(primaMxn) {
  return primaMxn >= 7500 ? 0.5 : 0
}

function calcularPuntosVI(primaMxn) {
  if (primaMxn >= 150000) return 3
  if (primaMxn >= 50000) return 2
  if (primaMxn >= 15000) return 1
  return 0
}

function calcularClasificacion(puntos) {
  if (puntos >= 3) return 'TRIPLE'
  if (puntos >= 2) return 'DOBLE'
  if (puntos >= 1) return 'SIMPLE'
  return 'CERO'
}

async function main() {
  console.log('🔧 Calculando puntos manualmente para pólizas TEST\n')
  console.log('='.repeat(80))

  try {
    await client.connect()
    console.log('✅ Conectado a BD Dev\n')

    // 1. Buscar pólizas TEST sin puntos
    const polizasResult = await client.query(`
      SELECT 
        p.id,
        p.numero_poliza,
        p.prima_mxn,
        p.puntos_actuales,
        p.producto_parametro_id,
        pp.tipo_producto,
        pt.code as product_code
      FROM polizas p
      INNER JOIN producto_parametros pp ON pp.id = p.producto_parametro_id
      INNER JOIN product_types pt ON pt.id = pp.product_type_id
      WHERE p.numero_poliza LIKE 'TEST-%'
        AND p.estatus = 'EN_VIGOR'
      ORDER BY p.numero_poliza
    `)

    const polizas = polizasResult.rows
    console.log(`📋 Encontradas ${polizas.length} pólizas TEST\n`)

    let actualizadas = 0

    for (const poliza of polizas) {
      let puntos = 0
      
      // Calcular puntos según tipo de producto
      if (poliza.product_code === 'GMM') {
        puntos = calcularPuntosGMM(parseFloat(poliza.prima_mxn))
      } else if (poliza.product_code === 'VI') {
        puntos = calcularPuntosVI(parseFloat(poliza.prima_mxn))
      }

      const clasificacion = calcularClasificacion(puntos)

      // Insertar o actualizar en cache
      await client.query(`
        INSERT INTO poliza_puntos_cache (
          poliza_id,
          puntos_total,
          clasificacion,
          base_factor,
          prima_anual_snapshot,
          producto_parametro_id,
          breakdown,
          recalculo_reason,
          computed_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (poliza_id) 
        DO UPDATE SET
          puntos_total = $2,
          clasificacion = $3,
          base_factor = $4,
          prima_anual_snapshot = $5,
          updated_at = NOW()
      `, [
        poliza.id,
        puntos,
        clasificacion,
        1, // base_factor
        poliza.prima_mxn,
        poliza.producto_parametro_id,
        JSON.stringify({
          prima_mxn: poliza.prima_mxn,
          producto: poliza.product_code,
          factor_base: 1
        }),
        'manual_calc'
      ])

      // Actualizar polizas.puntos_actuales
      await client.query(`
        UPDATE polizas
        SET puntos_actuales = $1,
            clasificacion_actual = $2
        WHERE id = $3
      `, [puntos, clasificacion, poliza.id])

      actualizadas++

      const icon = puntos > 0 ? '✅' : '📄'
      console.log(`${icon} ${poliza.numero_poliza}: $${parseFloat(poliza.prima_mxn).toLocaleString()} MXN → ${puntos} puntos (${clasificacion})`)
    }

    console.log(`\n✅ Actualizadas ${actualizadas} pólizas\n`)

    // Verificar por agente
    console.log('='.repeat(80))
    console.log('📊 RESUMEN POR AGENTE\n')

    const resumenResult = await client.query(`
      SELECT 
        u.email as agente_email,
        pt.code as product_code,
        COUNT(*) as total_polizas,
        SUM(p.puntos_actuales) as total_puntos
      FROM polizas p
      INNER JOIN producto_parametros pp ON pp.id = p.producto_parametro_id
      INNER JOIN product_types pt ON pt.id = pp.product_type_id
      INNER JOIN clientes c ON c.id = p.cliente_id
      INNER JOIN usuarios u ON u.id_auth = c.asesor_id
      WHERE p.numero_poliza LIKE 'TEST-%'
        AND p.estatus = 'EN_VIGOR'
      GROUP BY u.email, pt.code
      ORDER BY u.email, pt.code
    `)

    const porAgente = {}
    for (const row of resumenResult.rows) {
      if (!porAgente[row.agente_email]) {
        porAgente[row.agente_email] = { gmm: 0, vi: 0 }
      }
      if (row.product_code === 'GMM') {
        porAgente[row.agente_email].gmm = parseFloat(row.total_puntos) || 0
      } else if (row.product_code === 'VI') {
        porAgente[row.agente_email].vi = parseFloat(row.total_puntos) || 0
      }
    }

    for (const [email, puntos] of Object.entries(porAgente)) {
      console.log(`👤 ${email}`)
      console.log(`   📊 SEG_GMM: ${puntos.gmm}`)
      console.log(`   📊 SEG_VIDA: ${puntos.vi}\n`)
    }

    console.log('='.repeat(80))
    console.log('✅ Proceso completado\n')
    console.log('💡 Ahora GET /api/candidatos calculará automáticamente estos valores')
    console.log('   desde las pólizas EN_VIGOR de cada agente\n')

  } catch (error) {
    console.error('\n❌ Error:', error)
    throw error
  } finally {
    await client.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
