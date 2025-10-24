import type { PostgrestError } from '@supabase/supabase-js'
import { ensureAdminClient } from './supabaseAdmin'
import { decrypt, encrypt, type EncryptedPayload } from './encryption'

export type IntegrationProvider = 'google' | 'zoom' | 'teams'

export interface StoredIntegrationToken {
  accessToken: string
  refreshToken?: string | null
  expiresAt?: string | null
  scopes?: string[] | null
}

const TABLE = 'tokens_integracion'

function pack(value: string | null | undefined): string | null {
  if (!value) return null
  const payload = encrypt(value)
  return JSON.stringify(payload)
}

function unpack(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null
  try {
    const payload = JSON.parse(value) as EncryptedPayload
    return decrypt(payload)
  } catch {
    // fallback: assume legacy plain text
    return value
  }
}

interface TokenRow {
  usuario_id: string
  proveedor: IntegrationProvider
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
  scopes: string[] | null
}

export async function upsertIntegrationToken(
  usuarioId: string,
  proveedor: IntegrationProvider,
  token: {
    accessToken: string
    refreshToken?: string | null
    expiresAt?: string | null
    scopes?: string[] | null
  }
): Promise<{ error: PostgrestError | null }> {
  const supabase = ensureAdminClient()
  const payload = {
    usuario_id: usuarioId,
    proveedor,
    access_token: pack(token.accessToken),
    refresh_token: pack(token.refreshToken || null),
    expires_at: token.expiresAt ?? null,
    scopes: token.scopes ?? null,
    updated_at: new Date().toISOString()
  }
  const { error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'usuario_id,proveedor', ignoreDuplicates: false })
  if (!error) return { error: null }

  const message = error.message || ''
  const missingScopes = /column "?scopes"?/i.test(message)
  const missingUpdatedAt = /column "?updated_at"?/i.test(message)
  if (!missingScopes && !missingUpdatedAt) {
    return { error }
  }

  const legacyPayload = {
    usuario_id: usuarioId,
    proveedor,
    access_token: pack(token.accessToken),
    refresh_token: pack(token.refreshToken || null),
    expires_at: token.expiresAt ?? null
  }
  const { error: legacyError } = await supabase
    .from(TABLE)
    .upsert(legacyPayload, { onConflict: 'usuario_id,proveedor', ignoreDuplicates: false })
  return { error: legacyError }
}

export async function getIntegrationToken(
  usuarioId: string,
  proveedor: IntegrationProvider
): Promise<{ token: StoredIntegrationToken | null; error: PostgrestError | null }> {
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('access_token, refresh_token, expires_at, scopes')
    .eq('usuario_id', usuarioId)
    .eq('proveedor', proveedor)
    .maybeSingle<TokenRow>()
  if (error) {
    const message = error.message || ''
    if (/column "?scopes"?/i.test(message)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from(TABLE)
        .select('access_token, refresh_token, expires_at')
        .eq('usuario_id', usuarioId)
        .eq('proveedor', proveedor)
        .maybeSingle<TokenRow>()
      if (legacyError) return { token: null, error: legacyError }
      if (!legacyData) return { token: null, error: null }
      return {
        token: {
          accessToken: unpack(legacyData.access_token) || '',
          refreshToken: unpack(legacyData.refresh_token),
          expiresAt: legacyData.expires_at,
          scopes: null
        },
        error: null
      }
    }
    return { token: null, error }
  }
  if (!data) return { token: null, error: null }
  return {
    token: {
      accessToken: unpack(data.access_token) || '',
      refreshToken: unpack(data.refresh_token),
      expiresAt: data.expires_at,
      scopes: data.scopes
    },
    error: null
  }
}

export async function removeIntegrationToken(
  usuarioId: string,
  proveedor: IntegrationProvider
): Promise<{ error: PostgrestError | null }> {
  const supabase = ensureAdminClient()
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('usuario_id', usuarioId)
    .eq('proveedor', proveedor)
  return { error }
}
