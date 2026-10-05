import { initSupabase } from '../../api/lib/supabase/client'
import { trasladosService } from '../../api/traslados/traslados.service'
import { json, sp, type Env } from '../_lib/cf'
import { z } from 'zod'

const iniciarReubicacionSchema  = z.object({ usuarioId: z.string().uuid(), posicionOrigenCodigo: z.string().min(1), productoCodigo: z.string().min(1) })
const confirmarReubicacionSchema = z.object({ usuarioId: z.string().uuid(), loteId: z.string().uuid(), posicionDestinoCodigo: z.string().min(1), posicionDestinoId: z.string().uuid() })
const iniciarIntercambioSchema  = z.object({ usuarioId: z.string().uuid(), posicionOrigenCodigo: z.string().min(1), productoOrigenCodigo: z.string().min(1) })
const seleccionarDestinoSchema  = z.object({ usuarioId: z.string().uuid(), loteOrigenId: z.string().uuid(), posicionDestinoCodigo: z.string().min(1), productoDestinoCodigo: z.string().min(1) })
const confirmarIntercambioSchema = z.object({ usuarioId: z.string().uuid(), loteOrigenId: z.string().uuid(), loteDestinoId: z.string().uuid(), codigoRackOrigenFinal: z.string().min(1), codigoRackDestinoFinal: z.string().min(1) })

const acciones: Record<string, { schema: z.ZodObject<any>; fn: (d: any) => Promise<any> }> = {
  'iniciar-reubicacion':   { schema: iniciarReubicacionSchema,   fn: (d) => trasladosService.iniciarReubicacion(d) },
  'confirmar-reubicacion': { schema: confirmarReubicacionSchema, fn: (d) => trasladosService.confirmarReubicacion(d) },
  'iniciar-intercambio':   { schema: iniciarIntercambioSchema,   fn: (d) => trasladosService.iniciarIntercambio(d) },
  'seleccionar-destino':   { schema: seleccionarDestinoSchema,   fn: (d) => trasladosService.seleccionarDestinoIntercambio(d) },
  'confirmar-intercambio': { schema: confirmarIntercambioSchema, fn: (d) => trasladosService.confirmarIntercambio(d) },
}

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  if (request.method === 'GET') {
    const result = await trasladosService.obtenerRacksDisponibles()
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  if (request.method === 'POST') {
    const accion = sp(request).get('accion')
    const entry  = accion ? acciones[accion] : undefined
    if (!entry) return json({ error: { code: 'INVALID_ACTION', message: 'Acción no reconocida' } }, 400)

    const body   = await request.json().catch(() => ({}))
    const parsed = entry.schema.safeParse(body)
    if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)

    const result = await entry.fn(parsed.data) as { ok: boolean; data?: unknown; error?: any }
    if (!result.ok) {
      const code   = result.error?.code ?? ''
      const status = code === 'NOT_FOUND' ? 404 : (code === 'CONFLICT_POSICION_OCUPADA' || code === 'CONFLICT_CONCURRENCIA') ? 409 : 400
      return json({ error: result.error }, status)
    }
    return json(result.data)
  }

  return json({ error: 'Método no permitido' }, 405)
}
