#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Crea código para el agente por defecto (ing.zamarripaa@gmail.com)
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const DATABASE_URL = process.env.DevDATABASE_URL
const DEFAULT_EMAIL = 'paopecina3@gmail.com'

if (!DATABASE_URL) {
  console.error('❌ DevDATABASE_URL no encontrada')
  process.exit(1)
}

async function createDefaultAgentCode() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    console.log('🔄 Conectando a DEV database...\n')
    
    // Buscar agente por defecto
    const { rows } = await pool.query(`
      SELECT id, nombre, email, rol
      FROM usuarios
      WHERE email = $1
    `, [DEFAULT_EMAIL])
    
    if (rows.length === 0) {
      console.log(`⚠️  Agente con email ${DEFAULT_EMAIL} no encontrado`)
      console.log('   Puedes crearlo o usar otro agente como default')
      return
    }
    
    const agente = rows[0]
    console.log(`📋 Agente encontrado: ${agente.nombre} (${agente.email})`)
    console.log(`   Rol: ${agente.rol}\n`)
    
    // Generar código basado en el nombre
    const palabras = agente.nombre.trim().split(/\s+/)
    let iniciales = ''
    for (const palabra of palabras) {
      if (palabra.length > 0) {
        iniciales += palabra[0].toUpperCase()
      }
    }
    if (iniciales.length > 3) {
      iniciales = iniciales.substring(0, 3)
    }
    while (iniciales.length < 2) {
      iniciales += 'X'
    }
    const code = `${iniciales}CT${new Date().getFullYear()}`
    
    console.log(`📝 Código a crear: ${code}`)
    
    // Insertar código
    await pool.query(`
      INSERT INTO agent_codes (code, agente_id, nombre_agente, activo)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (code) DO UPDATE
      SET agente_id = EXCLUDED.agente_id,
          nombre_agente = EXCLUDED.nombre_agente
    `, [code, agente.id, agente.nombre])
    
    console.log(`✅ Código ${code} creado/actualizado para ${agente.nombre}`)
    console.log(`\n🎉 Agente por defecto configurado exitosamente`)
    
    // Verificar el código
    const { rows: verification } = await pool.query(`
      SELECT code, nombre_agente, activo 
      FROM agent_codes 
      WHERE code = $1
    `, [code])
    
    if (verification.length > 0) {
      console.log('\n🧪 Verificación:')
      console.log(`   Code: ${verification[0].code}`)
      console.log(`   Agente: ${verification[0].nombre_agente}`)
      console.log(`   Activo: ${verification[0].activo}`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

createDefaultAgentCode()
