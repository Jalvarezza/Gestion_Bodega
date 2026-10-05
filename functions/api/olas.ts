import { initSupabase, supabase } from '../../api/lib/supabase/client'
import { olasService } from '../../api/olas/olas.service'
import { olasExtraccionService } from '../../api/olas/olas-extraccion.service'
import { olasPreparacionService } from '../../api/olas/olas-preparacion.service'
import { olasDespachoService } from '../../api/olas/olas-despacho.service'
import { json, errStatus, sp, type Env } from '../_lib/cf'
import { z } from 'zod'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const lineaSchema = z.object({
  lpn:                z.string().min(1),
  posicionOrden:      z.coerce.number().int().min(1),
  codigoBarra:        z.string().min(1),
  codigoProveedor:    z.string().optional(),
  skuProveedor:       z.string().optional(),
  tienda:             z.string().optional(),
  cantidadSolicitada: z.coerce.number().int().positive(),
})
const ordenSchema = z.object({
  numeroOrden: z.string().min(1),
  numeroGuia:  z.string().optional(),
  lineas:      z.array(lineaSchema).min(1),
})
const validarArchivoSchema = z.object({
  skus: z.array(z.object({ codigoBarra: z.string().min(1), cantidadTotal: z.coerce.number().int().positive() })).min(1),
})
const crearOlaSchema = z.object({
  usuarioId:      z.string().uuid(),
  proveedor:      z.enum(['imperial', 'construmart']),
  fechaEntrega:   z.string().min(1),
  archivoNombre:  z.string().min(1),
  ordenes:        z.array(ordenSchema).min(1),
})
const activarOlaSchema  = z.object({ olaId: z.string().uuid(), usuarioId: z.string().uuid() })
const cancelarOlaSchema = z.object({ olaId: z.string().uuid() })

const tomarTareaSchema     = z.object({ tareaId: z.string().uuid(), usuarioId: z.string().uuid() })
const confirmarExtracSchema = z.object({
  tareaId:          z.string().uuid(),
  usuarioId:        z.string().uuid(),
  cantidadExtraida: z.coerce.number().int().min(0),
})
const liberarPropiasSchema = z.object({ olaId: z.string().uuid(), usuarioId: z.string().uuid() })

const escanearLpnSchema     = z.object({ olaId: z.string().uuid(), lpn: z.string().min(1), usuarioId: z.string().uuid() })
const escanearLpnF3Schema   = z.object({ olaId: z.string().uuid(), lpn: z.string().min(1), supervisorId: z.string().uuid() })
const despacharOlaSchema    = z.object({ olaId: z.string().uuid(), supervisorId: z.string().uuid(), nombreChofer: z.string().min(1) })

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getUsuarioId(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const params = sp(request)
  const accion = params.get('accion')
  const id     = params.get('id')
  const estado = params.get('estado')

  // ── GET ────────────────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    if (accion === 'olas') {
      const result = await olasService.listarOlas(estado ?? undefined)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    if (accion === 'ola') {
      if (!id) return json({ error: 'Falta id' }, 400)
      const result = await olasService.obtenerOla(id)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'cola-extraccion') {
      if (!id) return json({ error: 'Falta id de ola' }, 400)
      const result = await olasExtraccionService.colaTareas(id)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    if (accion === 'lineas-preparacion') {
      if (!id) return json({ error: 'Falta id de ola' }, 400)
      const result = await olasPreparacionService.lineasPendientes(id)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    if (accion === 'lineas-despacho') {
      if (!id) return json({ error: 'Falta id de ola' }, 400)
      const result = await olasDespachoService.lineasDespacho(id)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    if (accion === 'resumen-despacho') {
      if (!id) return json({ error: 'Falta id de ola' }, 400)
      const result = await olasDespachoService.resumenDespacho(id)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    return json({ error: 'Acción GET no reconocida' }, 400)
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}))

    if (accion === 'validar-archivo') {
      const parsed = validarArchivoSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await olasService.validarArchivo(parsed.data.skus)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    if (accion === 'crear-ola') {
      const parsed = crearOlaSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await olasService.crearOla(parsed.data)
      return result.ok ? json(result.data, 201) : json({ error: result.error }, 500)
    }
    if (accion === 'activar-ola') {
      const parsed = activarOlaSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await olasService.activarOla(parsed.data.olaId, parsed.data.usuarioId)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'cancelar-ola') {
      const parsed = cancelarOlaSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await olasService.cancelarOla(parsed.data.olaId)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }

    // Extracción
    if (accion === 'tomar-tarea') {
      const parsed = tomarTareaSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await olasExtraccionService.tomarTarea(parsed.data.tareaId, parsed.data.usuarioId)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'confirmar-extraccion') {
      const parsed = confirmarExtracSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await olasExtraccionService.confirmarExtraccion(
        parsed.data.tareaId, parsed.data.usuarioId, parsed.data.cantidadExtraida,
      )
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'liberar-propias-extraccion') {
      const parsed = liberarPropiasSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await olasExtraccionService.liberarPropias(parsed.data.olaId, parsed.data.usuarioId)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }

    // Preparación
    if (accion === 'escanear-lpn-f2') {
      const parsed = escanearLpnSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await olasPreparacionService.escanearLpn(
        parsed.data.olaId, parsed.data.lpn, parsed.data.usuarioId,
      )
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }

    // Despacho
    if (accion === 'escanear-lpn-f3') {
      const parsed = escanearLpnF3Schema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await olasDespachoService.escanearLpnFase3(
        parsed.data.olaId, parsed.data.lpn, parsed.data.supervisorId,
      )
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }
    if (accion === 'despachar-ola') {
      const parsed = despacharOlaSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await olasDespachoService.despacharOla(
        parsed.data.olaId, parsed.data.supervisorId, parsed.data.nombreChofer,
      )
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus((result.error as any).code))
    }

    return json({ error: 'Acción POST no reconocida' }, 400)
  }

  return json({ error: 'Método no permitido' }, 405)
}
