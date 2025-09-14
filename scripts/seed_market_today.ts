/* Seed today UDI/FX values using service role (manual helper) */
import { getServiceClient, ensureAdminClient } from '@/lib/supabaseAdmin'

async function main() {
  ensureAdminClient()
  const supabase = getServiceClient()
  const today = new Date().toISOString().slice(0,10)
  const udi = { fecha: today, valor: 7.5, source: 'seed', fetched_at: new Date().toISOString(), stale: false }
  const fx = { fecha: today, valor: 17.0, source: 'seed', fetched_at: new Date().toISOString(), stale: false }
  const u1 = await supabase.from('udi_values').upsert(udi, { onConflict: 'fecha' }).select().single()
  if (u1.error) throw u1.error
  const f1 = await supabase.from('fx_values').upsert(fx, { onConflict: 'fecha' }).select().single()
  if (f1.error) throw f1.error
  console.log('Seeded market values for', today)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
