import { initSupabase } from '../../api/lib/supabase/client'
import { historialService } from '../../api/historial/historial.service'
import { json, sp, type Env } from '../_lib/cf'
import { z } from 'zod'

const filtrosSchema = z.object({
  tipo:      z.string().optional(),
  usuarioId: z.string().uuid().optional(),
  desde:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limite:    z.coerce.number().int().min(1).max(200).optional(),
  offset:    z.coerce.number().int().min(0).optional(),
})

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405)

  const params = sp(request)
  const vista = params.get('vista')
  const id    = params.get('id')

  if (vista === 'ingreso' && id) {
    const result = await historialService.obtenerMovimientosPorIngreso(id)
    return result.ok ? json(result.data) : json({ error: result.error }, 404)
  }
  if (vista === 'nota' && id) {
    const result = await historialService.obtenerMovimientosPorNota(id)
    return result.ok ? json(result.data) : json({ error: result.error }, 404)
  }
  if (vista === 'traslado' && id) {
    const result = await historialService.obtenerMovimientosPorTraslado(id)
    return result.ok ? json(result.data) : json({ error: result.error }, 404)
  }
  if (vista === 'ocs') {
    const result = await historialService.listarOCs()
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }
  if (vista === 'oc-productos' && id) {
    const result = await historialService.obtenerProductosPorOC(id)
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }
  if (vista === 'oc-producto') {
    const importacionId = params.get('importacionId')
    const productoId    = params.get('productoId')
    if (!importacionId || !productoId) return json({ error: 'Se requieren importacionId y productoId' }, 400)
    const result = await historialService.obtenerMovimientosPorOCYProducto(importacionId, productoId)
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  const raw: Record<string, string> = {}
  params.forEach((v, k) => { raw[k] = v })
  const parsed = filtrosSchema.safeParse(raw)
  if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)

  const result = await historialService.obtenerMovimientos(parsed.data as any)
  return result.ok ? json(result.data) : json({ error: result.error }, 500)
}
