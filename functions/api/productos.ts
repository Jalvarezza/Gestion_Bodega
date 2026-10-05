import { initSupabase } from '../../api/lib/supabase/client'
import { productosService } from '../../api/productos/productos.service'
import { json, sp, type Env } from '../_lib/cf'

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405)

  const params      = sp(request)
  const id          = params.get('id')
  const sku         = params.get('sku')
  const codigoBarra = params.get('codigoBarra')
  const q           = params.get('q')
  const ubicaciones = params.get('ubicaciones')

  if (id && ubicaciones === 'true') {
    const result = await productosService.obtenerUbicaciones(id)
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }
  if (id) {
    const result = await productosService.obtenerProducto(id)
    return result.ok ? json(result.data) : json({ error: result.error }, 404)
  }
  if (sku) {
    const result = await productosService.buscarPorSku(sku)
    return result.ok ? json(result.data) : json({ error: result.error }, 404)
  }
  if (codigoBarra) {
    const result = await productosService.buscarPorCodigoBarra(codigoBarra)
    return result.ok ? json(result.data) : json({ error: result.error }, 404)
  }
  if (q && q.length >= 2) {
    const result = await productosService.buscarPorTexto(q)
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  const result = await productosService.listarProductos()
  return result.ok ? json(result.data) : json({ error: result.error }, 500)
}
