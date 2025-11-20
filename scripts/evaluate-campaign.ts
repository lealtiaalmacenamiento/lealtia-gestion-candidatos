#!/usr/bin/env ts-node

import 'tsconfig-paths/register.js'
import { parseArgs } from 'node:util'
import { config as loadEnv } from 'dotenv'
import {
  evaluateCampaignCached,
  fetchCampaignBySlug,
  fetchCampaigns,
  fetchCampaignMetricsForUser,
  fetchCampaignRulesMap
} from '../src/lib/campaigns.ts'
import { ensureAdminClient } from '../src/lib/supabaseAdmin.ts'
import { fetchUserSegmentIds } from '../src/lib/segments.ts'
import type { Campaign } from '../src/types'

type CliOptions = {
  usuarioId: number
  slug?: string | null
  ttl: number
}

function parseCli(): CliOptions {
  const { values } = parseArgs({
    options: {
      user: { type: 'string', short: 'u' },
      slug: { type: 'string', short: 's' },
      ttl: { type: 'string' }
    }
  })

  const userRaw = values.user ?? process.env.CAMPAIGN_USER_ID
  if (!userRaw) {
    throw new Error('Debes indicar el usuario objetivo con --user <id> o CAMPAIGN_USER_ID')
  }
  const usuarioId = Number(userRaw)
  if (!Number.isFinite(usuarioId) || usuarioId <= 0) {
    throw new Error(`ID de usuario inválido: ${userRaw}`)
  }
  const ttl = values.ttl ? Number(values.ttl) : 0
  if (!Number.isFinite(ttl) || ttl < 0) {
    throw new Error('TTL debe ser un número mayor o igual a 0')
  }

  return {
    usuarioId,
    slug: typeof values.slug === 'string' ? values.slug.trim() || null : null,
    ttl
  }
}

async function main(): Promise<void> {
  loadEnv({ path: '.env.local' })
  loadEnv() // fallback to default .env if exists

  const options = parseCli()
  const admin = ensureAdminClient()

  const { data: usuario, error: usuarioError } = await admin
    .from('usuarios')
    .select('id,rol,email')
    .eq('id', options.usuarioId)
    .maybeSingle()

  if (usuarioError) {
    throw new Error(`Error consultando usuario ${options.usuarioId}: ${usuarioError.message}`)
  }
  if (!usuario) {
    throw new Error(`Usuario ${options.usuarioId} no encontrado`)
  }

  const segmentIds = await fetchUserSegmentIds(options.usuarioId)

  let campaigns: Campaign[] = []
  if (options.slug) {
    const campaign = await fetchCampaignBySlug(options.slug)
    if (!campaign) {
      throw new Error(`No se encontró campaña con slug ${options.slug}`)
    }
    campaigns = [campaign]
  } else {
    campaigns = await fetchCampaigns({ status: 'active' })
  }

  if (!campaigns.length) {
    console.log('No hay campañas para evaluar')
    return
  }

  const campaignIds = campaigns.map(c => c.id)
  const rulesMap = await fetchCampaignRulesMap(campaignIds)

  console.log(`Evaluando ${campaigns.length} campaña(s) para usuario ${usuario.email ?? usuario.id} (ID ${usuario.id})`)

  let metrics: Awaited<ReturnType<typeof fetchCampaignMetricsForUser>> | null = null
  const metricsFetcher = async () => {
    if (!metrics) {
      metrics = await fetchCampaignMetricsForUser(options.usuarioId)
    }
    return JSON.parse(JSON.stringify(metrics))
  }

  for (const campaign of campaigns) {
    const rules = rulesMap.get(campaign.id) ?? []
    const { result, fromCache, snapshot } = await evaluateCampaignCached({
      campaign,
      rules,
      usuarioId: options.usuarioId,
      fetchMetrics: metricsFetcher,
      context: {
        usuarioRol: usuario.rol,
        segmentIds,
        segmentSlugs: []
      },
      cache: { ttlSeconds: options.ttl }
    })

    console.log(`- ${campaign.name} (${campaign.slug}) → elegible=${result.eligible} status=${result.status} progreso=${result.progress}`)
    console.log(`  cache: ${fromCache ? 'usó snapshot existente' : 'recalculado'} evaluado_en=${snapshot?.evaluated_at ?? 'N/A'}`)
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
