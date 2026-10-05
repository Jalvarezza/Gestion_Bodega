import { initSupabase } from '../../api/lib/supabase/client'
import { ubicacionesService } from '../../api/ubicaciones/ubicaciones.service'
import { json, sp, type Env } from '../_lib/cf'
import { z } from 'zod'

const uuidSchema = z.string().uuid()
const VISTAS     = ['mapa', 'estructura', 'posicion', 'racks', 'posiciones-libres', 'etiquetas', 'productos-pasillo', 'productos-posiciones'] as const

function fail(err: any): Response {
  const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'UNAUTHORIZED' ? 403 : 500
  return json({ error: err }, status)
}

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405)

  const params     = sp(request)
  const vista      = params.get('vista')
  const pasilloId  = params.get('pasilloId')
  const rackId     = params.get('rackId')
  const posicionId = params.get('posicionId')

  try {
    if (!vista) {
      const result = await ubicacionesService.listarPasillos()
      return result.ok ? json(result.data) : fail(result.error)
    }

    if (!VISTAS.includes(vista as any)) {
      return json({ error: { code: 'INVALID_VISTA', message: `Vista desconocida: ${vista}` } }, 400)
    }

    if (vista === 'mapa') {
      const result = await ubicacionesService.obtenerMapaBodega()
      return result.ok ? json(result.data) : fail(result.error)
    }
    if (vista === 'estructura') {
      const result = await ubicacionesService.obtenerEstructuraCompleta()
      return result.ok ? json(result.data) : fail(result.error)
    }
    if (vista === 'posicion') {
      const parsed = uuidSchema.safeParse(posicionId)
      if (!parsed.success) return json({ error: { code: 'INVALID_PARAM', message: 'posicionId debe ser un UUID válido' } }, 400)
      const result = await ubicacionesService.obtenerPosicion(parsed.data)
      return result.ok ? json(result.data) : fail(result.error)
    }
    if (vista === 'racks') {
      const parsed = uuidSchema.safeParse(pasilloId)
      if (!parsed.success) return json({ error: { code: 'INVALID_PARAM', message: 'pasilloId debe ser un UUID válido' } }, 400)
      const result = await ubicacionesService.listarRacksPorPasillo(parsed.data)
      return result.ok ? json(result.data) : fail(result.error)
    }
    if (vista === 'posiciones-libres') {
      if (rackId) {
        const parsed = uuidSchema.safeParse(rackId)
        if (!parsed.success) return json({ error: { code: 'INVALID_PARAM', message: 'rackId debe ser un UUID válido' } }, 400)
        const result = await ubicacionesService.listarPosicionesLibres(parsed.data)
        return result.ok ? json(result.data) : fail(result.error)
      }
      const result = await ubicacionesService.listarTodasPosicionesLibres()
      return result.ok ? json(result.data) : fail(result.error)
    }
    if (vista === 'etiquetas') {
      const result = await ubicacionesService.listarTodasPosiciones()
      return result.ok ? json(result.data) : fail(result.error)
    }
    if (vista === 'productos-pasillo') {
      const parsed = uuidSchema.safeParse(pasilloId)
      if (!parsed.success) return json({ error: { code: 'INVALID_PARAM', message: 'pasilloId debe ser un UUID válido' } }, 400)
      const result = await ubicacionesService.productosPorPasillo(parsed.data)
      return result.ok ? json(result.data) : fail(result.error)
    }
    if (vista === 'productos-posiciones') {
      const parsed = uuidSchema.safeParse(pasilloId)
      if (!parsed.success) return json({ error: { code: 'INVALID_PARAM', message: 'pasilloId debe ser un UUID válido' } }, 400)
      const result = await ubicacionesService.productosPorPosiciones(parsed.data)
      return result.ok ? json(result.data) : fail(result.error)
    }

    return json({ error: 'Vista no manejada' }, 400)
  } catch (err) {
    return json({ error: { code: 'UNEXPECTED_ERROR', message: String(err) } }, 500)
  }
}
