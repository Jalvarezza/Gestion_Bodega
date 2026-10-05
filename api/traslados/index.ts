// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { trasladosService } from './traslados.service'

const iniciarReubicacionSchema = z.object({
  usuarioId:            z.string().uuid(),
  posicionOrigenCodigo: z.string().min(1),
  productoCodigo:       z.string().min(1),
})

const confirmarReubicacionSchema = z.object({
  usuarioId:             z.string().uuid(),
  loteId:                z.string().uuid(),
  posicionDestinoCodigo: z.string().min(1),
  posicionDestinoId:     z.string().uuid(),
})

const iniciarIntercambioSchema = z.object({
  usuarioId:            z.string().uuid(),
  posicionOrigenCodigo: z.string().min(1),
  productoOrigenCodigo: z.string().min(1),
})

const seleccionarDestinoSchema = z.object({
  usuarioId:             z.string().uuid(),
  loteOrigenId:          z.string().uuid(),
  posicionDestinoCodigo: z.string().min(1),
  productoDestinoCodigo: z.string().min(1),
})

const confirmarIntercambioSchema = z.object({
  usuarioId:              z.string().uuid(),
  loteOrigenId:           z.string().uuid(),
  loteDestinoId:          z.string().uuid(),
  codigoRackOrigenFinal:  z.string().min(1),
  codigoRackDestinoFinal: z.string().min(1),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { accion } = req.query

  if (req.method === 'GET') {
    const result = await trasladosService.obtenerRacksDisponibles()
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (req.method === 'POST') {
    const schemas: Record<string, { schema: ReturnType<typeof z.object>; handler: (data: unknown) => Promise<unknown> }> = {
      'iniciar-reubicacion':     { schema: iniciarReubicacionSchema,     handler: (d) => trasladosService.iniciarReubicacion(d as never) },
      'confirmar-reubicacion':   { schema: confirmarReubicacionSchema,   handler: (d) => trasladosService.confirmarReubicacion(d as never) },
      'iniciar-intercambio':     { schema: iniciarIntercambioSchema,     handler: (d) => trasladosService.iniciarIntercambio(d as never) },
      'seleccionar-destino':     { schema: seleccionarDestinoSchema,     handler: (d) => trasladosService.seleccionarDestinoIntercambio(d as never) },
      'confirmar-intercambio':   { schema: confirmarIntercambioSchema,   handler: (d) => trasladosService.confirmarIntercambio(d as never) },
    }

    const entry = typeof accion === 'string' ? schemas[accion] : undefined
    if (!entry) {
      return res.status(400).json({ error: { code: 'INVALID_ACTION', message: 'Acción no reconocida' } })
    }

    const parsed = entry.schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
    }

    const result = await entry.handler(parsed.data) as { ok: boolean; data?: unknown; error?: unknown }
    if (!result.ok) {
      const err = result.error as { code?: string }
      const status = err?.code === 'NOT_FOUND' ? 404 : err?.code === 'CONFLICT_POSICION_OCUPADA' || err?.code === 'CONFLICT_CONCURRENCIA' ? 409 : 400
      return res.status(status).json({ error: result.error })
    }

    return res.status(200).json(result.data)
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
