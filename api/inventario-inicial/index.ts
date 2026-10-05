// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { z }                                    from 'zod'
import { inventarioInicialService }             from './inventarioInicial.service'

const resolverPosicionSchema = z.object({
  codigo: z.string().min(1),
})

const resolverProductoSchema = z.object({
  codigoBarra: z.string().min(1),
})

const eliminarLoteSchema = z.object({
  loteId: z.string().uuid(),
})

const buscarLotePosicionSchema = z.object({
  codigoPosicion: z.string().min(1),
})

const registrarLoteSchema = z.object({
  usuarioId:    z.string().uuid(),
  posicionId:   z.string().uuid(),
  productoId:   z.string().uuid(),
  cantidad:     z.number().int().min(0),
  fechaIngreso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido (YYYY-MM-DD)'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { accion } = req.query

  if (req.method === 'POST') {
    if (accion === 'resolver-posicion') {
      const parsed = resolverPosicionSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await inventarioInicialService.resolverPosicion(parsed.data.codigo)
      if (!result.ok) return res.status(404).json({ error: result.error })
      return res.status(200).json(result.data)
    }

    if (accion === 'resolver-producto') {
      const parsed = resolverProductoSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await inventarioInicialService.resolverProducto(parsed.data.codigoBarra)
      if (!result.ok) return res.status(404).json({ error: result.error })
      return res.status(200).json(result.data)
    }

    if (accion === 'registrar') {
      const parsed = registrarLoteSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await inventarioInicialService.registrarLote(parsed.data)
      if (!result.ok) {
        const status = result.error.code === 'NOT_FOUND' ? 404 : result.error.code === 'CONFLICT' ? 409 : 400
        return res.status(status).json({ error: result.error })
      }
      return res.status(200).json(result.data)
    }

    if (accion === 'buscar-lote-posicion') {
      const parsed = buscarLotePosicionSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await inventarioInicialService.buscarLotePorPosicion(parsed.data.codigoPosicion)
      if (!result.ok) return res.status(result.error.code === 'NOT_FOUND' ? 404 : 400).json({ error: result.error })
      return res.status(200).json(result.data)
    }

    if (accion === 'eliminar-lote') {
      const parsed = eliminarLoteSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await inventarioInicialService.eliminarLote(parsed.data.loteId)
      if (!result.ok) return res.status(result.error.code === 'NOT_FOUND' ? 404 : 400).json({ error: result.error })
      return res.status(200).json(result.data)
    }

    return res.status(400).json({ error: 'Acción no reconocida' })
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
