/**
 * Script para forzar ejecución de triggers en pólizas TEST
 * Actualiza las pólizas para que los triggers recalculen puntos
 */

const { Client } = require('pg')
require('dotenv').config({ path: '.env.local' })

const DEV_DB_URL = process.env.DevDATABASE_URL

if (!DEV_DB_URL) {
  console.error('❌ Falta DevDATABASE_URL en .env.local')
  process.exit(1)
}

const client = new Client({ connectionString: DEV_DB_URL })

async function main() {
  console.log('🔄 Forzando ejecución de triggers en BD DEV\n')
  console.log('='.repeat(80))

  try {
    await client.connect()
    console.log('✅ Conectado a BD Dev\n')

    // 1. Buscar pólizas TEST
    const polizasResult = await client.query(`
      SELECT 
        p.id,
        p.numero_poliza,
        p.prima_mxn,
        p.puntos_actuales,
        pp.tipo_producto,
        pt.code as product_code,
        c.asesor_id,
        u.email as agente_email
      FROM polizas p
      INNER JOIN producto_parametros pp ON pp.id = p.producto_parametro_id
      INNER JOIN product_types pt ON pt.id = pp.product_type_id
      INNER JOIN clientes c ON c.id = p.cliente_id
      INNER JOIN usuarios u ON u.id_auth = c.asesor_id
      WHERE p.numero_poliza LIKE 'TEST-%'
        AND p.estatus = 'EN_VIGOR'
      ORDER BY p.numero_poliza
    `)

    const polizas = polizasResult.rows
    console.log(`📋 Encontradas ${polizas.length} pólizas TEST\n`)

    if (polizas.length === 0) {
      console.log('⚠️  No hay pólizas TEST para procesar')
      return
    }

    // 2. Agrupar por agente
    const porAgente = {}
    for (const p of polizas) {
      if (!porAgente[p.agente_email]) {
        porAgente[p.agente_email] = { gmm: [], vi: [] }
      }
      if (p.product_code === 'GMM') {
        porAgente[p.agente_email].gmm.push(p)
      } else if (p.product_code === 'VI') {
        porAgente[p.agente_email].vi.push(p)
      }
    }

    // 3. Forzar triggers con UPDATE
    console.log('🔧 Forzando recalculo de puntos...\n')

    for (const p of polizas) {
      // Hacer UPDATE de un campo para disparar el trigger
      await client.query(`
        UPDATE polizas 
        SET updated_at = NOW()
        WHERE id = $1
      `, [p.id])

      // Esperar un poco para que el trigger se ejecute
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`✅ Actualizado updated_at de ${polizas.length} pólizas\n`)

    // 4. Verificar puntos actualizados
    console.log('📊 Verificando puntos calculados...\n')
    console.log('='.repeat(80))

    for (const [email, data] of Object.entries(porAgente)) {
      console.log(`\n👤 ${email}`)
      
      let totalGmm = 0
      let totalVi = 0

      if (data.gmm.length > 0) {
        console.log('\n  🔷 GMM:')
        for (const p of data.gmm) {
          const updated = await client.query(`
            SELECT puntos_actuales, clasificacion_actual
            FROM polizas
            WHERE id = $1
          `, [p.id])

          const puntos = updated.rows[0]?.puntos_actuales ?? 0
          totalGmm += puntos

          const esperado = p.prima_mxn >= 7500 ? 0.5 : 0
          const match = puntos === esperado ? '✅' : '⚠️'

          console.log(`     ${match} ${p.numero_poliza}: $${p.prima_mxn.toLocaleString()} MXN → ${puntos} puntos (esperado: ${esperado})`)
        }
      }

      if (data.vi.length > 0) {
        console.log('\n  🔶 VI:')
        for (const p of data.vi) {
          const updated = await client.query(`
            SELECT puntos_actuales, clasificacion_actual
            FROM polizas
            WHERE id = $1
          `, [p.id])

          const puntos = updated.rows[0]?.puntos_actuales ?? 0
          totalVi += puntos

          let esperado = 0
          if (p.prima_mxn >= 150000) esperado = 3
          else if (p.prima_mxn >= 50000) esperado = 2
          else if (p.prima_mxn >= 15000) esperado = 1

          const match = puntos === esperado ? '✅' : '⚠️'

          console.log(`     ${match} ${p.numero_poliza}: $${p.prima_mxn.toLocaleString()} MXN → ${puntos} puntos (esperado: ${esperado})`)
        }
      }

      console.log(`\n  📊 Total SEG_GMM: ${totalGmm}`)
      console.log(`  📊 Total SEG_VIDA: ${totalVi}`)
    }

    console.log('\n' + '='.repeat(80))
    console.log('✅ Proceso completado\n')
    console.log('💡 Ahora puedes consultar GET /api/candidatos con estos agentes')
    console.log('   para ver los valores SEG_GMM y SEG_VIDA calculados automáticamente\n')

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
