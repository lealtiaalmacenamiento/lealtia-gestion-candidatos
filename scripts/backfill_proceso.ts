/*
 Script de backfill para recalcular y persistir 'proceso' en todos los candidatos existentes.
 Requisitos:
  - Ejecutar con ts-node o compilar previamente.
  - Variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (clave service role) o
    usar una COOKIE de sesión admin y endpoint interno (ajustar fetchAuthHeaders()).

 Uso (opción simple con service role, recomendado solo local):
   npx ts-node scripts/backfill_proceso.ts

 Este script:
 1. Obtiene todos los candidatos (incluyendo eliminados opcionalmente).
 2. Para cada uno hace PUT /api/candidatos/{id} sin cambiar campos de negocio, provocando que
    el backend recalcule 'proceso'.
 3. Controla concurrencia para no saturar (batchSize).
*/

import 'dotenv/config'

const BASE_URL = process.env.BACKFILL_BASE_URL || 'http://localhost:3000'
const INCLUDE_DELETED = process.env.BACKFILL_INCLUDE_DELETED === '1'
const DRY_RUN = process.env.DRY_RUN === '1'
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 5)

interface CandidatoMin { id_candidato: number }

async function fetchCandidatos(): Promise<CandidatoMin[]> {
  const url = `${BASE_URL}/api/candidatos${INCLUDE_DELETED ? '?eliminados=1' : ''}`
  const r = await fetch(url, { headers: await fetchAuthHeaders() })
  if (!r.ok) throw new Error(`Error fetch candidatos: ${r.status}`)
  const data = await r.json()
  if (!Array.isArray(data)) return []
  return data as CandidatoMin[]
}

async function fetchAuthHeaders(): Promise<Record<string,string>> {
  // Ajustar si se requiere token específico; aquí vacío (asumiendo cookie auth en local no necesaria)
  const headers: Record<string,string> = { 'Content-Type': 'application/json' }
  // Ejemplo: headers['Authorization'] = `Bearer ${process.env.BACKFILL_TOKEN}`
  return headers
}

async function updateCandidato(id: number) {
  if (DRY_RUN) {
    console.log(`[DRY] PUT candidato ${id}`)
    return
  }
  const url = `${BASE_URL}/api/candidatos/${id}`
  const r = await fetch(url, { method: 'PUT', headers: await fetchAuthHeaders(), body: JSON.stringify({}) })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`PUT ${id} fallo: ${r.status} ${txt}`)
  }
  console.log(`OK candidato ${id}`)
}

async function run() {
  console.log('Iniciando backfill proceso...')
  const all = await fetchCandidatos()
  console.log(`Total candidatos: ${all.length}`)
  let i = 0
  while (i < all.length) {
    const batch = all.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(c => updateCandidato(c.id_candidato).catch(err => console.error('Error id', c.id_candidato, err.message))))
    i += BATCH_SIZE
  }
  console.log('Backfill completado')
}

run().catch(e => { console.error(e); process.exit(1) })
