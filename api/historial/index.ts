// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { historialService, type TipoMovimiento } from './historial.service'

const TIPOS_VALIDOS: TipoMovimiento[] = [
  'ingreso', 'ingreso_parcial', 'ubicacion_rack', 'picking',
  'salida', 'salida_parcial', 'traslado_reubicacion', 'traslado_intercambio',
  'equivalente_usado', 'cambio_estado_nota', 'revision_admin', 'despacho',
]

const filtrosSchema = z.object({
  tipo:      z.enum(TIPOS_VALIDOS as [TipoMovimiento, ...TipoMovimiento[]]).optional(),
  usuarioId: z.string().uuid().optional(),
  desde:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limite:    z.coerce.number().int().min(1).max(200).optional(),
  offset:    z.coerce.number().int().min(0).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { vista, id } = req.query

  if (vista === 'ingreso' && typeof id === 'string') {
    const result = await historialService.obtenerMovimientosPorIngreso(id)
    if (!result.ok) return res.status(404).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (vista === 'nota' && typeof id === 'string') {
    const result = await historialService.obtenerMovimientosPorNota(id)
    if (!result.ok) return res.status(404).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (vista === 'traslado' && typeof id === 'string') {
    const result = await historialService.obtenerMovimientosPorTraslado(id)
    if (!result.ok) return res.status(404).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (vista === 'ocs') {
    const result = await historialService.listarOCs()
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (vista === 'oc-productos' && typeof id === 'string') {
    const result = await historialService.obtenerProductosPorOC(id)
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (vista === 'oc-producto') {
    const { importacionId, productoId } = req.query
    if (typeof importacionId !== 'string' || typeof productoId !== 'string') {
      return res.status(400).json({ error: 'Se requieren importacionId y productoId' })
    }
    const result = await historialService.obtenerMovimientosPorOCYProducto(importacionId, productoId)
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  // TC-HIS-001, TC-HIS-002, TC-HIS-003, TC-HIS-006: lista general con filtros
  const parsed = filtrosSchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
  }

  const result = await historialService.obtenerMovimientos(parsed.data)
  if (!result.ok) return res.status(500).json({ error: result.error })
  return res.status(200).json(result.data)
}
