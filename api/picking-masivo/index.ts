// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { pickingMasivoService } from './picking-masivo.service'

const lineaSchema = z.object({
  upc:           z.string().nullable(),
  codigoCliente: z.string().nullable(),
  descripcion:   z.string(),
  vin:           z.string().min(1),
  cantidad:      z.number().int().nonnegative(),
})

const previsualizarSchema = z.object({ lineas: z.array(lineaSchema).min(1) })

const crearSchema = z.object({
  usuarioId:     z.string().uuid(),
  numeroOc:      z.string().trim().min(1),
  nombreCliente: z.string().trim().min(1),
  archivoNombre: z.string().nullable(),
  lineas:        z.array(lineaSchema).min(1),
})

const lineaUsuarioSchema = z.object({ usuarioId: z.string().uuid(), itemId: z.string().uuid() })

const pickingSchema = z.object({
  usuarioId:          z.string().uuid(),
  itemId:             z.string().uuid(),
  codigoRack:         z.string().trim().min(1),
  codigoProducto:     z.string().trim().min(1),
  cantidad:           z.number().int().positive(),
  loteId:             z.string().uuid().optional(),
  esParadaIntermedia: z.boolean().optional(),
  comentario:         z.string().nullable().optional(),
})

const sinStockSchema = z.object({ usuarioId: z.string().uuid(), itemId: z.string().uuid(), comentario: z.string() })
const cancelarSchema = z.object({ usuarioId: z.string().uuid(), sesionId: z.string().uuid() })

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 403, NOT_FOUND: 404, LINEA_TOMADA: 409, CONFLICT_OC_DUPLICADA: 409, DB_ERROR: 500,
}

function responder(res: NextApiResponse, result: any, okStatus = 200) {
  if (result.ok) return res.status(okStatus).json(result.data)
  return res.status(STATUS[result.error.code] ?? 400).json({ error: result.error })
}

function validar<T>(schema: z.ZodType<T>, body: unknown, res: NextApiResponse): T | null {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
    return null
  }
  return parsed.data
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const accion = typeof req.query.accion === 'string' ? req.query.accion : ''

  if (req.method === 'GET') {
    if (typeof req.query.id === 'string') return responder(res, await pickingMasivoService.obtenerOrden(req.query.id))
    return responder(res, await pickingMasivoService.listarOrdenes())
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  switch (accion) {
    case 'previsualizar': {
      const d = validar(previsualizarSchema, req.body, res); if (!d) return
      return responder(res, await pickingMasivoService.previsualizar(d.lineas))
    }
    case 'crear': {
      const d = validar(crearSchema, req.body, res); if (!d) return
      return responder(res, await pickingMasivoService.crearOrden(d), 201)
    }
    case 'tomar-linea': {
      const d = validar(lineaUsuarioSchema, req.body, res); if (!d) return
      return responder(res, await pickingMasivoService.tomarLinea(d))
    }
    case 'liberar-linea': {
      const d = validar(lineaUsuarioSchema, req.body, res); if (!d) return
      return responder(res, await pickingMasivoService.liberarLinea(d))
    }
    case 'picking': {
      const d = validar(pickingSchema, req.body, res); if (!d) return
      return responder(res, await pickingMasivoService.registrarPicking(d))
    }
    case 'sin-stock': {
      const d = validar(sinStockSchema, req.body, res); if (!d) return
      return responder(res, await pickingMasivoService.registrarSinStock(d))
    }
    case 'cancelar': {
      const d = validar(cancelarSchema, req.body, res); if (!d) return
      return responder(res, await pickingMasivoService.cancelarOrden(d))
    }
    default:
      return res.status(400).json({ error: { code: 'ACCION_INVALIDA', message: 'Acción no reconocida' } })
  }
}
