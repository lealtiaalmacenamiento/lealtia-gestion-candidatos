import { config } from 'dotenv'
config({ path: '.env.local' }) // <<--- aquí le dices que lea ese archivo
import 'dotenv/config' // si tu script está en ESM (import/export)
// o en CommonJS: require('dotenv').config()

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {

  console.log('URL: ' + SUPABASE_URL)

  console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env URL: ' + SUPABASE_URL + 'supa role: ' + SERVICE_ROLE_KEY)
  process.exit(1)
}


// 2. Datos del usuario base
const email = 'orozco.jaime25@gmail.com'
const password = 'AnimalSMF98@'
const nombre = 'Jaime Orozco'
const rol = 'admin'  // o 'superusuario', según tu lógica
const activo = true

// 3. Crear cliente de servicio
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function main() {
  try {
    console.log(`➡ Creando usuario maestro: ${email} ...`)

    // Crear en Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })
    if (authError) throw new Error(`Auth: ${authError.message}`)
    console.log('✅ Usuario creado en Supabase Auth')

    // Insertar en tabla usuarios
    const { error: dbError } = await supabase.from('usuarios').insert([
      { email, nombre, rol, activo }
    ])
    if (dbError) throw new Error(`Tabla usuarios: ${dbError.message}`)
    console.log('✅ Usuario insertado en tabla usuarios')

    console.log('\n🎉 Usuario maestro creado con éxito')
    console.log('----------------------------------')
    console.log('Email:', email)
    console.log('Password:', password)
    console.log('Rol:', rol)
    console.log('----------------------------------')
  } catch (err) {
    console.error('❌ Error creando usuario base:', err.message)
  }
}

main()
