#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const mainUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace('wqutrjnxvcgmyyiyjmsd', 'oooyuomshachmmblmpvd')
const mainClient = createClient(mainUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)

const functionsToCheck = [
  'apply_cliente_update',
  'apply_poliza_update',
  'apply_poliza_update_dbg',
  'polizas_before_insupd_enforce_moneda',
  'producto_parametros_after_update_sync_moneda',
  'recalc_polizas_by_producto_parametro',
  'recalc_puntos_poliza',
  'recalc_puntos_poliza_all'
]

async function verifyMainFunctions() {
  console.log('\n🔍 Verificando funciones en MAIN...\n')
  
  for (const fname of functionsToCheck) {
    const { data, error } = await mainClient
      .from('pg_proc')
      .select('proname, prosrc')
      .eq('proname', fname)
      .single()
    
    if (error) {
      console.log(`❌ ${fname}: No encontrada`)
      continue
    }
    
    const src = data.prosrc || ''
    const hasPublicSchema = src.includes('public.polizas') || 
                           src.includes('public.clientes') ||
                           src.includes('public.producto_parametros')
    
    const hasPublicTypes = src.includes('public.moneda_poliza') ||
                          src.includes('public.estatus_poliza')
    
    if (hasPublicSchema || hasPublicTypes) {
      console.log(`✅ ${fname}: OK`)
    } else {
      console.log(`⚠️ ${fname}: Puede faltar public.`)
    }
  }
}

verifyMainFunctions()
