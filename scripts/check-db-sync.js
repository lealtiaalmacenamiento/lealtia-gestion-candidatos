/**
 * Verifica sincronización de funciones RPC del executive dashboard
 * entre DEV y PROD.
 * Uso: node scripts/check-db-sync.js
 */
require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

// Estado esperado tras aplicar TODAS las migraciones
const EXPECTED_FUNCTIONS = [
  // name, min_args (para detectar sobrecargas viejas)
  { name: 'rpc_exec_asesores_list',     args: 0 },
  { name: 'rpc_exec_kpis',              args: 3 },  // desde, hasta, asesor
  { name: 'rpc_exec_tendencia',         args: 4 },  // desde, hasta, asesor, granularity
  { name: 'rpc_exec_funnel',            args: 1 },  // solo asesor_auth_id (3-arg debe estar ELIMINADA)
  { name: 'rpc_exec_citas_stats',       args: 3 },
  { name: 'rpc_exec_sla_stats',         args: 3 },
  { name: 'rpc_exec_motivos_descarte',  args: 3 },
  { name: 'rpc_exec_polizas_por_tipo',  args: 3 },
  { name: 'rpc_exec_polizas_vencer',    args: 2 },  // (dias int, asesor uuid)
  { name: 'rpc_exec_top_asesores',      args: 3 },
  { name: 'rpc_exec_top_clientes',      args: 2 },  // (asesor uuid, lim int)
]

// La sobrecarga vieja de funnel (3 args: date, date, uuid) debe estar ELIMINADA
const MUST_NOT_EXIST = [
  { name: 'rpc_exec_funnel', args: 3 },
]

const QUERY = `
  SELECT
    p.proname AS name,
    COUNT(pp.pronargs)::int AS overload_count,
    array_agg(pp.pronargs ORDER BY pp.pronargs) AS arg_counts
  FROM pg_proc pp
  JOIN pg_namespace n ON n.oid = pp.pronamespace
  JOIN (SELECT DISTINCT proname FROM pg_proc JOIN pg_namespace ns ON ns.oid = pronamespace WHERE ns.nspname = 'public') p
    ON p.proname = pp.proname
  WHERE n.nspname = 'public'
    AND pp.proname LIKE 'rpc_exec_%'
  GROUP BY p.proname
  ORDER BY p.proname;
`

async function checkDb(label, url) {
  if (!url) {
    console.log(`\n⚠️  ${label}: URL no encontrada en .env.local\n`)
    return
  }
  const client = new Client({ connectionString: url })
  await client.connect()

  const { rows } = await client.query(QUERY)
  await client.end()

  // Indexar por nombre
  const found = {}
  for (const r of rows) {
    found[r.name] = r.arg_counts.map(Number)
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  BD: ${label}`)
  console.log(`${'═'.repeat(60)}`)

  let ok = 0, missing = 0, phantom = 0, warn = 0

  for (const exp of EXPECTED_FUNCTIONS) {
    const argCounts = found[exp.name]
    if (!argCounts) {
      console.log(`  ❌ FALTA     ${exp.name} (esperado ${exp.args} args)`)
      missing++
    } else {
      const hasExpected = argCounts.includes(exp.args)
      if (hasExpected) {
        console.log(`  ✅ OK        ${exp.name} [args: ${argCounts.join(', ')}]`)
        ok++
      } else {
        console.log(`  ⚠️  ARGS DIFF ${exp.name} — esperado ${exp.args}, encontrado [${argCounts.join(', ')}]`)
        warn++
      }
    }
  }

  for (const ghost of MUST_NOT_EXIST) {
    const argCounts = found[ghost.name]
    if (argCounts && argCounts.includes(ghost.args)) {
      console.log(`  🚨 FANTASMA  ${ghost.name}(${ghost.args} args) — debería estar eliminada`)
      phantom++
    }
  }

  // Funciones rpc_exec_* no esperadas
  for (const name of Object.keys(found)) {
    if (!EXPECTED_FUNCTIONS.find(e => e.name === name)) {
      console.log(`  ℹ️  EXTRA     ${name} [args: ${found[name].join(', ')}]`)
    }
  }

  console.log(`\n  Resumen: ✅ ${ok} OK  ❌ ${missing} faltantes  ⚠️ ${warn} con args distintos  🚨 ${phantom} sobrecargas viejas`)
}

async function main() {
  console.log('\n🔍 Diagnóstico de sincronización DEV ↔ PROD\n')
  await checkDb('DEV  (DevDATABASE_URL)',  process.env.DevDATABASE_URL)
  await checkDb('PROD (MainDATABASE_URL)', process.env.MainDATABASE_URL)
  console.log('\n')
}

main().catch(e => { console.error('Error:', e.message); process.exit(1) })
