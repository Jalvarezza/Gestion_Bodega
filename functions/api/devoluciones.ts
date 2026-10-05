import { initSupabase } from '../../api/lib/supabase/client'
import { devolucionesService } from '../../api/devoluciones/devoluciones.service'
import { json, type Env } from '../_lib/cf'
import { z } from 'zod'

const schema = z.object({
  adminId:    z.string().uuid(),
  notaId:     z.string().uuid(),
  comentario: z.string().min(1),
  items: z.array(z.object({
    productoId:     z.string().uuid(),
    notaProductoId: z.string().uuid(),
    cantidad:       z.number().int().min(0),
  })).min(1),
})

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const body   = await request.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)

  const result = await devolucionesService.registrarDevolucion(parsed.data)
  if (!result.ok) {
    const status = result.error.code === 'UNAUTHORIZED' ? 403 : 500
    return json({ error: result.error }, status)
  }
  return json(result.data)
}
