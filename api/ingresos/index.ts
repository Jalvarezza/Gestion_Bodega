// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { supabase } from '../lib/supabase/client'
import { ingresosService } from './ingresos.service'

const crearImportacionSchema = z.object({
  adminId:       z.string().uuid(),
  numeroOc:      z.string().min(1),
  archivoNombre: z.string().min(1),
  productos: z.array(z.object({
    productoId:       z.string().uuid(),
    cantidadEsperada: z.number().int().positive(),
  })).min(1),
})

const validarCantidadSchema = z.object({
  detalleId:         z.string().uuid(),
  cantidadIngresada: z.number().int().positive(),
})

const almacenarEnRackSchema = z.object({
  adminId:               z.string().uuid(),
  detalleId:             z.string().uuid(),
  posicionId:            z.string().uuid(),
  cantidad:              z.number().int().positive(),
  agregarAMismoProducto: z.boolean().optional(),
})

const almacenarEnPasilloSchema = z.object({
  adminId:   z.string().uuid(),
  detalleId: z.string().uuid(),
  pasilloId: z.string().uuid(),
  cantidad:  z.number().int().positive(),
})


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { accion, id, estado } = req.query

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('ETag', '')

    if (accion === 'packing-file') {
      const { oc, anio } = req.query
      if (typeof oc !== 'string' || typeof anio !== 'string')
        return res.status(400).json({ error: 'Faltan parámetros oc o anio' })
      const base = `${anio}/${oc}`
      const { data: archivos, error: listErr } = await supabase.storage.from('importaciones').list(base)
      console.log('[packing-file] list base:', base, 'archivos:', JSON.stringify(archivos), 'listErr:', listErr)
      if (!archivos || archivos.length === 0) return res.status(404).json({ error: 'no archivos' })
      const encontrado = ['packing.pdf', 'packing_ylk.pdf'].find((c) => archivos.some((f) => f.name === c))
      if (!encontrado) return res.status(404).json({ error: 'packing no encontrado' })
      const { data: blob, error: dlErr } = await supabase.storage
        .from('importaciones')
        .download(`${base}/${encontrado}`)
      if (dlErr || !blob) return res.status(500).json({ error: dlErr?.message ?? 'sin blob' })
      const buffer = Buffer.from(await blob.arrayBuffer())
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${encontrado}"`)
      return res.status(200).send(buffer)
    }

    // Posiciones rack donde ya existe stock del mismo producto
    if (accion === 'posiciones-con-producto') {
      const { productoId } = req.query
      if (typeof productoId !== 'string') return res.status(400).json({ error: 'Falta productoId' })
      const { data: lotes } = await supabase
        .from('lotes_inventario')
        .select('posicion_id, cantidad, posiciones_rack(id, codigo, rack_id, racks(id, codigo, pasillos(id, codigo, nombre)))')
        .eq('producto_id', productoId)
        .eq('activo', true)
        .eq('en_pasillo', false)
        .not('posicion_id', 'is', null)
        .gt('cantidad', 0)

      // Agrupar por posicion_id sumando cantidades
      const mapaPos = new Map<string, { posicionId: string; codigo: string; rackCodigo: string; pasilloCodigo: string; pasilloNombre: string | null; stockActual: number }>()
      for (const l of (lotes ?? [])) {
        type PosRef = { id: string; codigo: string; rack_id: string; racks: { id: string; codigo: string; pasillos: { id: string; codigo: string; nombre: string | null } | null } | null } | null
        const pos = l.posiciones_rack as PosRef
        if (!pos || !l.posicion_id) continue
        const entry = mapaPos.get(l.posicion_id)
        if (entry) { entry.stockActual += l.cantidad }
        else mapaPos.set(l.posicion_id, {
          posicionId:    l.posicion_id,
          codigo:        pos.codigo,
          rackCodigo:    pos.racks?.codigo ?? '',
          pasilloCodigo: pos.racks?.pasillos?.codigo ?? '',
          pasilloNombre: pos.racks?.pasillos?.nombre ?? null,
          stockActual:   l.cantidad,
        })
      }
      return res.status(200).json(Array.from(mapaPos.values()))
    }

    if (typeof id === 'string') {
      const result = await ingresosService.obtenerDetalleImportacion(id)
      if (!result.ok) return res.status(404).json({ error: result.error })
      return res.status(200).json(result.data)
    }

    const result = await ingresosService.obtenerImportaciones(
      typeof estado === 'string' ? estado : undefined
    )
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (req.method === 'POST') {
    if (accion === 'validar-cantidad') {
      const parsed = validarCantidadSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await ingresosService.validarCantidadIngreso(parsed.data)
      if (!result.ok) return res.status(400).json({ error: result.error })
      return res.status(200).json(result.data)
    }

    if (accion === 'almacenar-rack') {
      const parsed = almacenarEnRackSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await ingresosService.almacenarEnRack(parsed.data)
      if (!result.ok) {
        const status = result.error.code === 'UNAUTHORIZED' ? 403
          : result.error.code === 'NOT_FOUND' ? 404
          : 400
        return res.status(status).json({ error: result.error })
      }
      return res.status(200).json(result.data)
    }

    if (accion === 'almacenar-pasillo') {
      const parsed = almacenarEnPasilloSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
      const result = await ingresosService.almacenarEnPasillo(parsed.data)
      if (!result.ok) {
        const status = result.error.code === 'UNAUTHORIZED' ? 403
          : result.error.code === 'NOT_FOUND' ? 404
          : 400
        return res.status(status).json({ error: result.error })
      }
      return res.status(200).json(result.data)
    }

    const parsed = crearImportacionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
    const result = await ingresosService.crearImportacion(parsed.data)
    if (!result.ok) {
      const status = result.error.code === 'UNAUTHORIZED' ? 403 : 400
      return res.status(status).json({ error: result.error })
    }
    return res.status(201).json(result.data)
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
