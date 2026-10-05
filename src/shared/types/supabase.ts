// Re-exporta los tipos generados por Supabase para uso exclusivo del frontend.
// Los servicios backend importan directamente desde api/lib/supabase/types.
export type { Database, Json } from '../../../api/lib/supabase/types'
