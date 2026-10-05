// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { devolucionesService } from './devoluciones.service'

const schema = z.object({
  adminId: z.string().uuid(),
  notaId:  z.string().uuid(),
  items: z.array(z.object({
    productoId:     z.string().uuid(),
    notaProductoId: z.string().uuid(),
    cantidad:       z.number().int().min(0),
  })).min(1),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
  }

  const result = await devolucionesService.registrarDevolucion(parsed.data)
  if (!result.ok) {
    const status = result.error.code === 'UNAUTHORIZED' ? 403 : 500
    return res.status(status).json({ error: result.error })
  }
  return res.status(200).json(result.data)
}
