// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { notasService } from '../notas/notas.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })

  const rol   = typeof req.query.rol   === 'string' ? req.query.rol   : 'operador'
  const desde = typeof req.query.desde === 'string' ? req.query.desde : null

  const result = await notasService.contarParaNotificaciones(rol, desde)
  if (!result.ok) return res.status(500).json({ error: result.error })
  return res.status(200).json(result.data)
}
