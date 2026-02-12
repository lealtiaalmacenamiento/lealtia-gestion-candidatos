#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Crea códigos iniciales para todos los agentes activos
 * Formato: Iniciales + CT + Año (ej: JMCT2026)
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const DATABASE_URL = process.env.DevDATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ DevDATABASE_URL no encontrada')
  process.exit(1)
}

function generateCode(nombre) {
  // Extraer iniciales del nombre
  const palabras = nombre.trim().split(/\s+/)
  let iniciales = ''
  
  // Tomar primera letra de cada palabra
  for (const palabra of palabras) {
    if (palabra.length > 0) {
      iniciales += palabra[0].toUpperCase()
    }
  }
  
  // Si tiene más de 3 iniciales, tomar solo las primeras 3
  if (iniciales.length > 3) {
    iniciales = iniciales.substring(0, 3)
  }
  
  // Si tiene menos de 2 iniciales, rellenar con X
  while (iniciales.length < 2) {
    iniciales += 'X'
  }
  
  const año = new Date().getFullYear()
  return `${iniciales}CT${año}`
}

async function createAgentCodes() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    console.log('🔄 Conectando a DEV database...\n')
    
    // Obtener todos los agentes activos
    const { rows: agentes } = await pool.query(`
      SELECT id, nombre, email, rol
      FROM usuarios
      WHERE activo = true AND rol = 'agente'
      ORDER BY nombre
    `)
    
    if (agentes.length === 0) {
      console.log('⚠️  No se encontraron agentes activos')
      return
    }
    
    console.log(`📋 Encontrados ${agentes.length} agentes activos\n`)
    
    const codigos = []
    const codigosUsados = new Set()
    
    for (const agente of agentes) {
      let code = generateCode(agente.nombre)
      let counter = 1
      
      // Si el código ya existe, agregar número
      while (codigosUsados.has(code)) {
        const baseCode = code.replace(/\d+$/, '')
        code = `${baseCode}${counter}`
        counter++
      }
      
      codigosUsados.add(code)
      codigos.push({
        code,
        agente_id: agente.id,
        nombre: agente.nombre,
        email: agente.email
      })
    }
    
    console.log('📝 Códigos generados:')
    codigos.forEach(c => {
      console.log(`   ${c.code} → ${c.nombre} (${c.email})`)
    })
    
    console.log('\n💾 Insertando códigos en la base de datos...')
    
    let insertados = 0
    let omitidos = 0
    
    for (const { code, agente_id, nombre } of codigos) {
      try {
        await pool.query(`
          INSERT INTO agent_codes (code, agente_id, nombre_agente, activo)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (code) DO NOTHING
        `, [code, agente_id, nombre])
        insertados++
      } catch (error) {
        console.error(`   ❌ Error insertando ${code}: ${error.message}`)
        omitidos++
      }
    }
    
    console.log(`\n✅ Insertados: ${insertados}`)
    if (omitidos > 0) {
      console.log(`⚠️  Omitidos (ya existían): ${omitidos}`)
    }
    
    console.log('\n🎉 Códigos de agente creados exitosamente')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

createAgentCodes()
