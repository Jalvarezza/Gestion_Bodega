import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnon) {
  throw new Error('Faltan variables de entorno: VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession:     true,
    storageKey:         'inventario-auth',
    storage:            window.localStorage,
    autoRefreshToken:   true,
    detectSessionInUrl: false,
  },
})

// Mantener auth_token sincronizado cuando Supabase refresca el JWT automáticamente
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED' && session?.access_token) {
    localStorage.setItem('auth_token', session.access_token)
  }
  if (event === 'SIGNED_OUT') {
    localStorage.removeItem('auth_token')
  }
})
