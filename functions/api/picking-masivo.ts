import { initSupabase, supabase } from '../../api/lib/supabase/client'
import { pickingMasivoService, type EditarParcialInput } from '../../api/picking-masivo/picking-masivo.service'
import { json, errStatus, sp, type Env } from '../_lib/cf'
import { z } from 'zod'

const itemExcelSchema = z.object({
  codigo: z.string().min(1), descripcion: z.string().min(1),
  cantidadPedida: z.coerce.number().int().positive(), productoId: z.string().uuid().optional(),
  codigoBarra: z.string().optional(), lpn: z.string().optional(),
})
const validarExcelSchema   = z.object({ items: z.array(itemExcelSchema).min(1) })
const crearSesionSchema    = z.object({
  usuarioId: z.string().uuid(), numeroOc: z.string().min(1),
  nombreCliente: z.string().optional(), numeroOcPedido: z.string().optional(),
  archivoNombre: z.string().min(1), items: z.array(itemExcelSchema).min(1),
})
const activarSesionSchema  = z.object({ sesionId: z.string().uuid(), usuarioId: z.string().uuid() })
const tomarSubtareaSchema  = z.object({ subtareaId: z.string().uuid(), usuarioId: z.string().uuid() })
const confirmarSubtareaSchema = z.object({
  subtareaId: z.string().uuid(), usuarioId: z.string().uuid(),
  cantidadDespachada: z.coerce.number().int().min(0), motivo: z.string().optional(),
  productoRealId: z.string().uuid().optional(),
})
const liberarPropiasSchema  = z.object({ sesionId: z.string().uuid(), usuarioId: z.string().uuid() })
const editarParcialSchema   = z.object({
  subtareaId: z.string().uuid(), usuarioId: z.string().uuid(),
  cantidadDespachada: z.coerce.number().int().min(0), motivo: z.string().optional(),
})
const validarLpnSchema      = z.object({ sesionId: z.string().uuid(), lpn: z.string().min(1) })
const despacharSesionSchema = z.object({ sesionId: z.string().uuid(), usuarioId: z.string().uuid(), nombreChofer: z.string().min(1) })
const cancelarSesionSchema  = z.object({ sesionId: z.string().uuid() })
const buscarItemSchema      = z.object({ sesionId: z.string().uuid(), termino: z.string().min(1) })
const validarItemSchema     = z.object({ sesionId: z.string().uuid(), itemId: z.string().uuid() })
const guardarLpnsSchema     = z.object({ sesionId: z.string().uuid(), lpnsData: z.array(z.any()) })

async function getUsuarioId(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const params = sp(request)
  const accion = params.get('accion')
  const id     = params.get('id')
  const estado = params.get('estado')

  if (request.method === 'GET') {
    if (accion === 'sesiones') {
      const result = await pickingMasivoService.listarSesiones(estado ?? undefined)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    if (accion === 'sesion') {
      if (!id) return json({ error: 'Falta id' }, 400)
      const result = await pickingMasivoService.obtenerSesion(id)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'cola') {
      const usuarioId = await getUsuarioId(request)
      if (!usuarioId) return json({ error: 'No autenticado' }, 401)
      if (!id) return json({ error: 'Falta id de sesión' }, 400)
      const result = await pickingMasivoService.colaSubtareas(id, usuarioId)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    return json({ error: 'Acción GET no reconocida' }, 400)
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}))

    if (accion === 'validar-excel') {
      const parsed = validarExcelSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.validarExcel(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    if (accion === 'crear-sesion') {
      const parsed = crearSesionSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.crearSesion(parsed.data)
      return result.ok ? json(result.data, 201) : json({ error: result.error }, 500)
    }
    if (accion === 'activar-sesion') {
      const parsed = activarSesionSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.activarSesion(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'tomar-subtarea') {
      const parsed = tomarSubtareaSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.tomarSubtarea(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'confirmar-subtarea') {
      const parsed = confirmarSubtareaSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.confirmarSubtarea(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'liberar-propias') {
      const parsed = liberarPropiasSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.liberarPropias(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    if (accion === 'editar-parcial') {
      const parsed = editarParcialSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.editarParcial(parsed.data as EditarParcialInput)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'buscar-lpn') {
      const parsed = validarLpnSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.buscarLpn(parsed.data.sesionId, parsed.data.lpn)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'validar-lpn') {
      const parsed = validarLpnSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.validarLpn(parsed.data.sesionId, parsed.data.lpn)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'despachar-sesion') {
      const parsed = despacharSesionSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.despacharSesion(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'cancelar-sesion') {
      const parsed = cancelarSesionSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.cancelarSesion(parsed.data.sesionId)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'buscar-item') {
      const parsed = buscarItemSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.buscarItem(parsed.data.sesionId, parsed.data.termino)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'validar-item') {
      const parsed = validarItemSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.validarItem(parsed.data.sesionId, parsed.data.itemId)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    if (accion === 'guardar-lpns') {
      const parsed = guardarLpnsSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await pickingMasivoService.guardarLpns(parsed.data.sesionId, parsed.data.lpnsData)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    return json({ error: 'Acción POST no reconocida' }, 400)
  }

  return json({ error: 'Método no permitido' }, 405)
}
