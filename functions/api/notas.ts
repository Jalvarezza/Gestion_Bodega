import { initSupabase } from '../../api/lib/supabase/client'
import { notasService } from '../../api/notas/notas.service'
import { json, sp, type Env } from '../_lib/cf'
import { z } from 'zod'

const crearNotaSchema = z.object({
  adminId: z.string().uuid(), numeroNota: z.string().min(1), nombreCliente: z.string().min(1),
  rutCliente: z.string().min(1), numeroOc: z.string().optional(), archivoNombre: z.string().optional(),
  comentarioDespacho: z.string().optional(),
  productos: z.array(z.object({ productoId: z.string().uuid(), cantidadSolicitada: z.coerce.number().int().positive() })).min(1),
})
const pickingSchema = z.object({
  usuarioId: z.string().uuid(), notaProductoId: z.string().uuid(), codigoProducto: z.string().min(1).max(100),
  cantidad: z.coerce.number().int().positive(), usarEquivalente: z.boolean().optional(),
  productoEquivalenteId: z.string().uuid().optional(), comentarioOperador: z.string().optional().nullable(),
})
const sinStockSchema = z.object({
  usuarioId: z.string().uuid(), notaProductoId: z.string().uuid(), comentarioOperador: z.string(),
})
const concluirParcialSchema = z.object({
  usuarioId: z.string().uuid(), notaProductoId: z.string().uuid(), comentarioOperador: z.string().optional(),
})
const cambiarEstadoSchema = z.object({
  adminId: z.string().uuid(), notaId: z.string().uuid(),
  nuevoEstado: z.literal('despachada'), nombreChofer: z.string().min(1),
})
const enviarRevisionSchema = z.object({
  adminId: z.string().uuid(), notaId: z.string().uuid(),
})
const anularNotaSchema = z.object({
  adminId: z.string().uuid(),
  notaId:  z.string().uuid(),
  motivo:  z.string().min(1),
})
const eliminarNotaSchema = z.object({
  adminId: z.string().uuid(),
  notaId:  z.string().uuid(),
})
const editarNotaSchema = z.object({
  adminId:        z.string().uuid(),
  notaId:         z.string().uuid(),
  modificaciones: z.array(z.object({
    notaProductoId: z.string().uuid(),
    cantidad:       z.coerce.number().int().positive(),
    nuevoSku:       z.string().optional(),
  })).optional().default([]),
  nuevos: z.array(z.object({
    sku:      z.string().min(1),
    cantidad: z.coerce.number().int().positive(),
  })).optional().default([]),
  eliminar: z.array(z.string().uuid()).optional().default([]),
})

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const params    = sp(request)
  const accion    = params.get('accion')
  const id        = params.get('id')
  const estado    = params.get('estado')
  const usuarioId = params.get('usuarioId')

  if (request.method === 'GET') {
    if (id) {
      const result = await notasService.obtenerDetalleNota(id, usuarioId ?? undefined)
      return result.ok ? json(result.data) : json({ error: result.error }, 404)
    }
    const result = await notasService.obtenerNotas(estado ?? undefined)
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}))

    if (accion === 'picking') {
      const parsed = pickingSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await notasService.registrarPicking(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 400)
    }
    if (accion === 'sin-stock') {
      const parsed = sinStockSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await notasService.registrarSinStock(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 400)
    }
    if (accion === 'concluir-parcial') {
      const parsed = concluirParcialSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await notasService.concluirParcial(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 400)
    }
    if (accion === 'anular-nota') {
      const parsed = anularNotaSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await notasService.anularNota(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 400)
    }
    if (accion === 'eliminar-nota') {
      const parsed = eliminarNotaSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await notasService.eliminarNota(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 400)
    }
    if (accion === 'editar-nota') {
      const parsed = editarNotaSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await notasService.editarNota(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 400)
    }
    if (accion === 'enviar-revision') {
      const parsed = enviarRevisionSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await notasService.enviarARevision(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 400)
    }
    if (accion === 'cambiar-estado') {
      const parsed = cambiarEstadoSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await notasService.cambiarEstadoNota(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 400)
    }

    const parsed = crearNotaSchema.safeParse(body)
    if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
    const result = await notasService.crearNota(parsed.data)
    return result.ok ? json(result.data, 201) : json({ error: result.error }, 400)
  }

  return json({ error: 'Método no permitido' }, 405)
}
