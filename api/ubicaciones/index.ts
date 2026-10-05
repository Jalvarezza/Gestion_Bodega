// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ubicacionesService } from './ubicaciones.service'
import type { DomainError } from '../../src/shared/types/base'

// ── Schemas de validación ──────────────────────────────────────────────────

const uuidSchema  = z.string().uuid()
const vistaSchema = z.enum([
  'mapa', 'estructura', 'posicion', 'racks', 'posiciones-libres',
  'etiquetas', 'productos-pasillo', 'productos-posiciones',
])

// ── Helper: mapear código de error a HTTP status ───────────────────────────

function statusFromError(err: DomainError): number {
  if (err.code === 'NOT_FOUND')    return 404
  if (err.code === 'UNAUTHORIZED') return 403
  return 500
}

function fail(res: NextApiResponse, err: DomainError) {
  return res.status(statusFromError(err)).json({ error: err })
}

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { vista, pasilloId, rackId, posicionId } = req.query

  // Validar vista
  const vistaParsed = vistaSchema.safeParse(vista)

  try {
    // Sin vista → listar pasillos (ruta por defecto)
    if (!vista) {
      const result = await ubicacionesService.listarPasillos()
      if (!result.ok) return fail(res, result.error)
      return res.status(200).json(result.data)
    }

    if (!vistaParsed.success) {
      return res.status(400).json({ error: { code: 'INVALID_VISTA', message: `Vista desconocida: ${vista}` } })
    }

    if (vista === 'mapa') {
      const result = await ubicacionesService.obtenerMapaBodega()
      if (!result.ok) return fail(res, result.error)
      return res.status(200).json(result.data)
    }

    if (vista === 'estructura') {
      const result = await ubicacionesService.obtenerEstructuraCompleta()
      if (!result.ok) return fail(res, result.error)
      return res.status(200).json(result.data)
    }

    if (vista === 'posicion') {
      const parsed = uuidSchema.safeParse(posicionId)
      if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'posicionId debe ser un UUID válido' } })
      const result = await ubicacionesService.obtenerPosicion(parsed.data)
      if (!result.ok) return fail(res, result.error)
      return res.status(200).json(result.data)
    }

    if (vista === 'racks') {
      const parsed = uuidSchema.safeParse(pasilloId)
      if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'pasilloId debe ser un UUID válido' } })
      const result = await ubicacionesService.listarRacksPorPasillo(parsed.data)
      if (!result.ok) return fail(res, result.error)
      return res.status(200).json(result.data)
    }

    if (vista === 'posiciones-libres') {
      if (rackId !== undefined) {
        const parsed = uuidSchema.safeParse(rackId)
        if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'rackId debe ser un UUID válido' } })
        const result = await ubicacionesService.listarPosicionesLibres(parsed.data)
        if (!result.ok) return fail(res, result.error)
        return res.status(200).json(result.data)
      }
      const result = await ubicacionesService.listarTodasPosicionesLibres()
      if (!result.ok) return fail(res, result.error)
      return res.status(200).json(result.data)
    }

    if (vista === 'etiquetas') {
      const result = await ubicacionesService.listarTodasPosiciones()
      if (!result.ok) return fail(res, result.error)
      return res.status(200).json(result.data)
    }

    if (vista === 'productos-pasillo') {
      const parsed = uuidSchema.safeParse(pasilloId)
      if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'pasilloId debe ser un UUID válido' } })
      const result = await ubicacionesService.productosPorPasillo(parsed.data)
      if (!result.ok) return fail(res, result.error)
      return res.status(200).json(result.data)
    }

    if (vista === 'productos-posiciones') {
      const parsed = uuidSchema.safeParse(pasilloId)
      if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'pasilloId debe ser un UUID válido' } })
      const result = await ubicacionesService.productosPorPosiciones(parsed.data)
      if (!result.ok) return fail(res, result.error)
      return res.status(200).json(result.data)
    }

  } catch (err) {
    console.error('[ubicaciones] unexpected error:', err)
    return res.status(500).json({ error: { code: 'UNEXPECTED_ERROR', message: String(err) } })
  }
}
