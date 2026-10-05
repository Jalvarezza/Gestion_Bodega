// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { salidasService } from './salidas.service'

const validarProductoSchema = z.object({
  adminId:           z.string().uuid(),
  notaProductoId:    z.string().uuid(),
  codigoProducto:    z.string().min(1),
  cantidadIngresada: z.number().int().positive(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { accion } = req.query

  if (req.method === 'GET') {
    const result = await salidasService.obtenerNotasParaRevision()
    if (!result.ok) return res.status(500).json({ error: result.error })
    const mapped = result.data.map((n: any) => ({
      notaId:             n.id,
      numeroNota:         n.numero_nota,
      nombreCliente:      n.nombre_cliente,
      estado:             n.estado,
      totalProductos:     n.totalProductos,
      productosCompletos: n.totalRevisados,
      creadoEn:           n.created_at,
      actualizadoEn:      n.updated_at,
      fechaDespacho:      n.fecha_despacho ?? null,
      nombreChofer:       n.nombre_chofer ?? null,
      comentarioDespacho: n.comentario_despacho ?? null,
    }))
    return res.status(200).json(mapped)
  }

  if (req.method === 'POST') {
    if (accion === 'validar-producto') {
      const parsed = validarProductoSchema.safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      }
      const result = await salidasService.validarProductoRevision(parsed.data)
      if (!result.ok) {
        const status = result.error.code === 'UNAUTHORIZED' ? 403
          : result.error.code === 'NOT_FOUND' ? 404
          : 400
        return res.status(status).json({ error: result.error })
      }
      return res.status(200).json(result.data)
    }

    return res.status(400).json({ error: { code: 'INVALID_ACTION', message: 'Acción no reconocida' } })
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
