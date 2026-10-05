// @ts-nocheck
// v2
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { olasService } from './olas.service'
import { olasExtraccionService } from './olas-extraccion.service'
import { olasPreparacionService } from './olas-preparacion.service'
import { olasDespachoService } from './olas-despacho.service'

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
const activarOlaSchema   = z.object({ olaId: z.string().uuid(), usuarioId: z.string().uuid() })
const cancelarOlaSchema  = z.object({ olaId: z.string().uuid() })
const tomarTareaSchema   = z.object({ tareaId: z.string().uuid(), usuarioId: z.string().uuid() })
const confirmarExtracSchema = z.object({
  tareaId:          z.string().uuid(),
  usuarioId:        z.string().uuid(),
  cantidadExtraida: z.coerce.number().int().min(0),
})
const liberarPropiasSchema  = z.object({ olaId: z.string().uuid(), usuarioId: z.string().uuid() })
const escanearLpnSchema     = z.object({ olaId: z.string().uuid(), lpn: z.string().min(1), usuarioId: z.string().uuid() })
const escanearLpnF3Schema   = z.object({ olaId: z.string().uuid(), lpn: z.string().min(1), supervisorId: z.string().uuid() })
const despacharOlaSchema    = z.object({ olaId: z.string().uuid(), supervisorId: z.string().uuid(), nombreChofer: z.string().min(1) })

// ─── Helper ───────────────────────────────────────────────────────────────────

function errCode(code: string): number {
  if (code === 'NOT_FOUND') return 404
  if (code === 'CONFLICT')  return 409
  if (code === 'FORBIDDEN') return 403
  return 500
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const accion = req.query.accion as string | undefined
  const id     = req.query.id     as string | undefined
  const estado = req.query.estado as string | undefined

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (accion === 'olas') {
      const result = await olasService.listarOlas(estado)
      return result.ok ? res.json(result.data) : res.status(500).json({ error: result.error })
    }
    if (accion === 'ola') {
      if (!id) return res.status(400).json({ error: 'Falta id' })
      const result = await olasService.obtenerOla(id)
      return result.ok ? res.json(result.data) : res.status(errCode((result.error as any).code)).json({ error: result.error })
    }
    if (accion === 'cola-extraccion') {
      if (!id) return res.status(400).json({ error: 'Falta id de ola' })
      const result = await olasExtraccionService.colaTareas(id)
      return result.ok ? res.json(result.data) : res.status(500).json({ error: result.error })
    }
    if (accion === 'lineas-preparacion') {
      if (!id) return res.status(400).json({ error: 'Falta id de ola' })
      const result = await olasPreparacionService.lineasPendientes(id)
      return result.ok ? res.json(result.data) : res.status(500).json({ error: result.error })
    }
    if (accion === 'lineas-despacho') {
      if (!id) return res.status(400).json({ error: 'Falta id de ola' })
      const result = await olasDespachoService.lineasDespacho(id)
      return result.ok ? res.json(result.data) : res.status(500).json({ error: result.error })
    }
    if (accion === 'resumen-despacho') {
      if (!id) return res.status(400).json({ error: 'Falta id de ola' })
      const result = await olasDespachoService.resumenDespacho(id)
      return result.ok ? res.json(result.data) : res.status(500).json({ error: result.error })
    }
    return res.status(400).json({ error: 'Acción GET no reconocida' })
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body ?? {}

    if (accion === 'validar-archivo') {
      const parsed = validarArchivoSchema.safeParse(body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await olasService.validarArchivo(parsed.data.skus)
      return result.ok ? res.json(result.data) : res.status(500).json({ error: result.error })
    }
    if (accion === 'crear-ola') {
      const parsed = crearOlaSchema.safeParse(body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await olasService.crearOla(parsed.data)
      return result.ok ? res.status(201).json(result.data) : res.status(500).json({ error: result.error })
    }
    if (accion === 'activar-ola') {
      const parsed = activarOlaSchema.safeParse(body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await olasService.activarOla(parsed.data.olaId, parsed.data.usuarioId)
      return result.ok ? res.json(result.data) : res.status(errCode((result.error as any).code)).json({ error: result.error })
    }
    if (accion === 'cancelar-ola') {
      const parsed = cancelarOlaSchema.safeParse(body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await olasService.cancelarOla(parsed.data.olaId)
      return result.ok ? res.json(result.data) : res.status(errCode((result.error as any).code)).json({ error: result.error })
    }

    if (accion === 'tomar-tarea') {
      const parsed = tomarTareaSchema.safeParse(body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await olasExtraccionService.tomarTarea(parsed.data.tareaId, parsed.data.usuarioId)
      return result.ok ? res.json(result.data) : res.status(errCode((result.error as any).code)).json({ error: result.error })
    }
    if (accion === 'confirmar-extraccion') {
      const parsed = confirmarExtracSchema.safeParse(body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await olasExtraccionService.confirmarExtraccion(
        parsed.data.tareaId, parsed.data.usuarioId, parsed.data.cantidadExtraida,
      )
      return result.ok ? res.json(result.data) : res.status(errCode((result.error as any).code)).json({ error: result.error })
    }
    if (accion === 'liberar-propias-extraccion') {
      const parsed = liberarPropiasSchema.safeParse(body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await olasExtraccionService.liberarPropias(parsed.data.olaId, parsed.data.usuarioId)
      return result.ok ? res.json(result.data) : res.status(500).json({ error: result.error })
    }

    if (accion === 'escanear-lpn-f2') {
      const parsed = escanearLpnSchema.safeParse(body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await olasPreparacionService.escanearLpn(
        parsed.data.olaId, parsed.data.lpn, parsed.data.usuarioId,
      )
      return result.ok ? res.json(result.data) : res.status(errCode((result.error as any).code)).json({ error: result.error })
    }

    if (accion === 'escanear-lpn-f3') {
      const parsed = escanearLpnF3Schema.safeParse(body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await olasDespachoService.escanearLpnFase3(
        parsed.data.olaId, parsed.data.lpn, parsed.data.supervisorId,
      )
      return result.ok ? res.json(result.data) : res.status(errCode((result.error as any).code)).json({ error: result.error })
    }
    if (accion === 'despachar-ola') {
      const parsed = despacharOlaSchema.safeParse(body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await olasDespachoService.despacharOla(
        parsed.data.olaId, parsed.data.supervisorId, parsed.data.nombreChofer,
      )
      return result.ok ? res.json(result.data) : res.status(errCode((result.error as any).code)).json({ error: result.error })
    }

    return res.status(400).json({ error: 'Acción POST no reconocida' })
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
