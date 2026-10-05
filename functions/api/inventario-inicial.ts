import { initSupabase } from '../../api/lib/supabase/client'
import { inventarioInicialService } from '../../api/inventario-inicial/inventarioInicial.service'
import { json, errStatus, sp, type Env } from '../_lib/cf'
import { z } from 'zod'

const resolverPosicionSchema    = z.object({ codigo: z.string().min(1) })
const resolverProductoSchema    = z.object({ codigoBarra: z.string().min(1) })
const registrarLoteSchema       = z.object({
  usuarioId: z.string().uuid(), posicionId: z.string().uuid(), productoId: z.string().uuid(),
  cantidad: z.coerce.number().int().min(0), fechaIngreso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
const buscarLotePosicionSchema  = z.object({ codigoPosicion: z.string().min(1) })
const eliminarLoteSchema        = z.object({ loteId: z.string().uuid() })

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const accion = sp(request).get('accion')
  const body   = await request.json().catch(() => ({}))

  if (accion === 'resolver-posicion') {
    const parsed = resolverPosicionSchema.safeParse(body)
    if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
    const result = await inventarioInicialService.resolverPosicion(parsed.data.codigo)
    return result.ok ? json(result.data) : json({ error: result.error }, 404)
  }
  if (accion === 'resolver-producto') {
    const parsed = resolverProductoSchema.safeParse(body)
    if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
    const result = await inventarioInicialService.resolverProducto(parsed.data.codigoBarra)
    return result.ok ? json(result.data) : json({ error: result.error }, 404)
  }
  if (accion === 'registrar') {
    const parsed = registrarLoteSchema.safeParse(body)
    if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
    const result = await inventarioInicialService.registrarLote(parsed.data)
    return result.ok ? json(result.data) : json({ error: result.error }, errStatus(result.error.code))
  }

  if (accion === 'buscar-lote-posicion') {
    const parsed = buscarLotePosicionSchema.safeParse(body)
    if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
    const result = await inventarioInicialService.buscarLotePorPosicion(parsed.data.codigoPosicion)
    return result.ok ? json(result.data) : json({ error: result.error }, 404)
  }
  if (accion === 'eliminar-lote') {
    const parsed = eliminarLoteSchema.safeParse(body)
    if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
    const result = await inventarioInicialService.eliminarLote(parsed.data.loteId)
    return result.ok ? json(result.data) : json({ error: result.error }, 400)
  }

  return json({ error: 'Acción no reconocida' }, 400)
}
