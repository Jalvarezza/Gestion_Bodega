import { initSupabase } from '../../api/lib/supabase/client'
import { notasService } from '../../api/notas/notas.service'
import { json, sp, type Env } from '../_lib/cf'

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405)

  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const params = sp(request)
  const rol    = params.get('rol')   ?? 'operador'
  const desde  = params.get('desde') ?? null

  const result = await notasService.contarParaNotificaciones(rol, desde)
  return result.ok ? json(result.data) : json({ error: result.error }, 500)
}
