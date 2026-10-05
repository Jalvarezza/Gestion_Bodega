import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function initSupabase(url: string, key: string): SupabaseClient {
  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _client
}

// Local dev: inicializar desde process.env si están disponibles
try {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) initSupabase(url, key)
} catch {
  // En Cloudflare Workers process.env no existe — initSupabase() se llama por request
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string | symbol) {
    if (!_client) throw new Error('Supabase no inicializado. Llama initSupabase() primero.')
    return (_client as any)[prop]
  },
})
