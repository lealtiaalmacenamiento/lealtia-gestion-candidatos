#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const sql = `CREATE OR REPLACE FUNCTION public.trigger_invalidate_cache_on_planificaciones()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  v_usuario_id := COALESCE(NEW.agente_id, OLD.agente_id);
  
  IF v_usuario_id IS NOT NULL THEN
    PERFORM public.invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;`

const devUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const mainUrl = devUrl.replace('wqutrjnxvcgmyyiyjmsd', 'oooyuomshachmmblmpvd')

const devClient = createClient(devUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)
const mainClient = createClient(mainUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function apply(client, name) {
  console.log(`\n🔄 Aplicando a ${name}...`)
  const pg = require('pg')
  const dbUrl = name === 'DEV' ? process.env.DevDATABASE_URL : process.env.MainDATABASE_URL
  
  const pgClient = new pg.Client({ connectionString: dbUrl })
  await pgClient.connect()
  
  try {
    await pgClient.query(sql)
    console.log(`✅ ${name} actualizado`)
  } catch (err) {
    console.error(`❌ ${name} error:`, err.message)
  } finally {
    await pgClient.end()
  }
}

async function main() {
  console.log('📝 Corrigiendo trigger de planificaciones...')
  await apply(devClient, 'DEV')
  await apply(mainClient, 'MAIN')
  console.log('\n✅ Completado. Ejecuta: node scripts/sync-existing-citas-to-planificacion.js')
}

main()
