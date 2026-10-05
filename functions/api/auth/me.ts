import { initSupabase, supabase } from '../../../api/lib/supabase/client'
import { json, type Env } from '../../_lib/cf'

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405)

  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return json({ error: 'No token' }, 401)

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return json({ error: 'Token inválido' }, 401)

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol, nombre')
    .eq('id', user.id)
    .single()

  if (!usuario) return json({ error: 'Usuario no configurado' }, 404)

  return json({ rol: usuario.rol, nombre: usuario.nombre, id: user.id })
}
