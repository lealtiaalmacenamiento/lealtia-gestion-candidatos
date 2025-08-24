import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

function buildPlaceholder(): SupabaseClient {
	const handler: ProxyHandler<object> = {
		get() {
			throw new Error('Supabase no configurado: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
		}
	}
	return new Proxy({}, handler) as SupabaseClient
}

export const supabase: SupabaseClient = (() => {
	if (supabaseUrl && supabaseAnonKey) {
		client = createClient(supabaseUrl, supabaseAnonKey)
		return client
	}
	// Durante build (sin vars) devolvemos placeholder; en runtime con vars se puede recrear manualmente si se necesita
	return buildPlaceholder()
})()

export function getSupabaseClient(): SupabaseClient {
	if (client) return client
	if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase no configurado')
	client = createClient(supabaseUrl, supabaseAnonKey)
	return client
}
