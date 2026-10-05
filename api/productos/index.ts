// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { productosService } from './productos.service'
import type { ProductoConUbicacion } from './productos.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { id, sku, codigoBarra, q, ubicaciones } = req.query

  if (typeof id === 'string' && ubicaciones === 'true') {
    const result = await productosService.obtenerUbicaciones(id)
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (typeof id === 'string') {
    const result = await productosService.obtenerProducto(id)
    if (!result.ok) return res.status(404).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (typeof sku === 'string') {
    const result = await productosService.buscarPorSku(sku)
    if (!result.ok) return res.status(404).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (typeof codigoBarra === 'string') {
    const result = await productosService.buscarPorCodigoBarra(codigoBarra)
    if (!result.ok) return res.status(404).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (typeof q === 'string' && q.length >= 2) {
    const result = await productosService.buscarPorTexto(q)
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data as ProductoConUbicacion[])
  }

  const result = await productosService.listarProductos()
  if (!result.ok) return res.status(500).json({ error: result.error })
  return res.status(200).json(result.data)
}
