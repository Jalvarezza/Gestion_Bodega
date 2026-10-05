// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { supabase } from '../lib/supabase/client'
import { pickingMasivoService } from './picking-masivo.service'

// ─── Schemas de validación ────────────────────────────────────────────────────

const itemExcelSchema = z.object({
  codigo:        z.string().min(1),
  descripcion:   z.string().min(1),
  cantidadPedida: z.number().int().positive(),
  productoId:    z.string().uuid().optional(),
  codigoBarra:   z.string().optional(),
  lpn:           z.string().optional(),
})

const validarExcelSchema = z.object({
  items: z.array(itemExcelSchema).min(1),
})

const crearSesionSchema = z.object({
  usuarioId:     z.string().uuid(),
  numeroOc:      z.string().min(1),
  nombreCliente: z.string().optional(),
  archivoNombre: z.string().min(1),
  items:         z.array(itemExcelSchema).min(1),
})

const parcharSkuSchema = z.object({
  sesionId: z.string().min(1),
  items:    z.array(z.object({ codigo: z.string().min(1), skuProveedor: z.string().min(1) })).min(1),
})

const activarSesionSchema = z.object({
  sesionId:  z.string().uuid(),
  usuarioId: z.string().uuid(),
})

const tomarSubtareaSchema = z.object({
  subtareaId: z.string().uuid(),
  usuarioId:  z.string().uuid(),
})

const confirmarSubtareaSchema = z.object({
  subtareaId:         z.string().uuid(),
  usuarioId:          z.string().uuid(),
  cantidadDespachada: z.number().int().min(0),
  motivo:             z.string().optional(),
  productoRealId:     z.string().uuid().optional(),
})

const liberarPropiasSchema = z.object({
  sesionId:  z.string().uuid(),
  usuarioId: z.string().uuid(),
})

const validarLpnSchema = z.object({
  sesionId: z.string().uuid(),
  lpn:      z.string().min(1),
})

const despacharSesionSchema = z.object({
  sesionId:     z.string().uuid(),
  usuarioId:    z.string().uuid(),
  nombreChofer: z.string().min(1),
})

const editarParcialSchema = z.object({
  subtareaId:         z.string().uuid(),
  usuarioId:          z.string().uuid(),
  cantidadDespachada: z.number().int().min(0),
  motivo:             z.string().optional(),
})

const cancelarSesionSchema = z.object({
  sesionId: z.string().uuid(),
})

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getUsuarioId(req: NextApiRequest): Promise<string | null> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { accion, id, estado } = req.query

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store')

    if (accion === 'sesiones') {
      const filtroEstado = typeof estado === 'string' ? estado : undefined
      const result = await pickingMasivoService.listarSesiones(filtroEstado)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(500).json({ error: result.error })
    }

    if (accion === 'sesion') {
      if (typeof id !== 'string') return res.status(400).json({ error: 'Falta id' })
      const result = await pickingMasivoService.obtenerSesion(id)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(result.error.code === 'NOT_FOUND' ? 404 : 500).json({ error: result.error })
    }

    if (accion === 'cola') {
      const usuarioId = await getUsuarioId(req)
      if (!usuarioId) return res.status(401).json({ error: 'No autenticado' })
      if (typeof id !== 'string') return res.status(400).json({ error: 'Falta id de sesión' })
      const result = await pickingMasivoService.colaSubtareas(id, usuarioId)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(500).json({ error: result.error })
    }

    return res.status(400).json({ error: 'Acción GET no reconocida' })
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {

    if (accion === 'validar-excel') {
      const parsed = validarExcelSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.validarExcel(parsed.data)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(500).json({ error: result.error })
    }

    if (accion === 'crear-sesion') {
      const parsed = crearSesionSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.crearSesion(parsed.data)
      return result.ok
        ? res.status(201).json(result.data)
        : res.status(500).json({ error: result.error })
    }

    if (accion === 'activar-sesion') {
      const parsed = activarSesionSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.activarSesion(parsed.data)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(
            result.error.code === 'NOT_FOUND' ? 404
            : result.error.code === 'INVALID_STATE' ? 409
            : 500
          ).json({ error: result.error })
    }

    if (accion === 'tomar-subtarea') {
      const parsed = tomarSubtareaSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.tomarSubtarea(parsed.data)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(
            result.error.code === 'NOT_FOUND' ? 404
            : result.error.code === 'CONFLICT' ? 409
            : 500
          ).json({ error: result.error })
    }

    if (accion === 'confirmar-subtarea') {
      const parsed = confirmarSubtareaSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.confirmarSubtarea(parsed.data)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(
            result.error.code === 'NOT_FOUND' ? 404
            : result.error.code === 'UNAUTHORIZED' ? 403
            : result.error.code === 'VALIDATION_ERROR' ? 400
            : result.error.code === 'INVALID_STATE' ? 409
            : 500
          ).json({ error: result.error })
    }

    if (accion === 'liberar-propias') {
      const parsed = liberarPropiasSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.liberarPropias(parsed.data)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(500).json({ error: result.error })
    }

    if (accion === 'editar-parcial') {
      const parsed = editarParcialSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.editarParcial(parsed.data)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(
            result.error.code === 'NOT_FOUND' ? 404
            : result.error.code === 'INVALID_STATE' ? 409
            : 500
          ).json({ error: result.error })
    }

    if (accion === 'buscar-lpn') {
      const parsed = validarLpnSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.buscarLpn(parsed.data.sesionId, parsed.data.lpn)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(result.error.code === 'NOT_FOUND' ? 404 : 500).json({ error: result.error })
    }

    if (accion === 'validar-lpn') {
      const parsed = validarLpnSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.validarLpn(parsed.data.sesionId, parsed.data.lpn)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(result.error.code === 'NOT_FOUND' ? 404 : 500).json({ error: result.error })
    }

    if (accion === 'buscar-item') {
      const { sesionId, termino } = req.body as { sesionId: string; termino: string }
      if (!sesionId || !termino) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'sesionId y termino requeridos' } })
      const result = await pickingMasivoService.buscarItem(sesionId, termino)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(result.error.code === 'NOT_FOUND' ? 404 : 500).json({ error: result.error })
    }

    if (accion === 'validar-item') {
      const { sesionId, itemId } = req.body as { sesionId: string; itemId: string }
      if (!sesionId || !itemId) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'sesionId y itemId requeridos' } })
      const result = await pickingMasivoService.validarItem(sesionId, itemId)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(500).json({ error: result.error })
    }

    if (accion === 'despachar-sesion') {
      const parsed = despacharSesionSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.despacharSesion(parsed.data)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(
            result.error.code === 'NOT_FOUND' ? 404
            : result.error.code === 'INVALID_STATE' ? 409
            : result.error.code === 'VALIDATION_ERROR' ? 400
            : 500
          ).json({ error: result.error })
    }

    if (accion === 'cancelar-sesion') {
      const parsed = cancelarSesionSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.cancelarSesion(parsed.data.sesionId)
      return result.ok
        ? res.status(200).json(result.data)
        : res.status(
            result.error.code === 'NOT_FOUND' ? 404
            : result.error.code === 'INVALID_STATE' ? 409
            : 500
          ).json({ error: result.error })
    }

    if (accion === 'guardar-lpns') {
      const { sesionId, lpnsData } = req.body as { sesionId: string; lpnsData: unknown[] }
      if (!sesionId || !Array.isArray(lpnsData)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'sesionId y lpnsData requeridos' } })
      const result = await pickingMasivoService.guardarLpns(sesionId, lpnsData)
      return result.ok ? res.status(200).json(result.data) : res.status(500).json({ error: result.error })
    }

    if (accion === 'parchar-sku-proveedor') {
      const parsed = parcharSkuSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await pickingMasivoService.parcharSkuProveedor(parsed.data.sesionId, parsed.data.items)
      return result.ok ? res.status(200).json(result.data) : res.status(500).json({ error: result.error })
    }

    if (accion === 'guardar-lpns-escaneados') {
      const { sesionId, lpnsEscaneados } = req.body as { sesionId: string; lpnsEscaneados: string[] }
      if (!sesionId || !Array.isArray(lpnsEscaneados)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'sesionId y lpnsEscaneados requeridos' } })
      const result = await pickingMasivoService.guardarLpnsEscaneados(sesionId, lpnsEscaneados)
      return result.ok ? res.status(200).json(result.data) : res.status(500).json({ error: result.error })
    }

    return res.status(400).json({ error: 'Acción POST no reconocida' })
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
