// @ts-nocheck
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'

export type DevolucionItem = {
  productoId:     string
  notaProductoId: string
  cantidad:       number
}

export type RegistrarDevolucionInput = {
  adminId:    string
  notaId:     string
  comentario: string
  items:      DevolucionItem[]
}

export const devolucionesService = {
  async registrarDevolucion(input: RegistrarDevolucionInput): Promise<ServiceResult<{ procesados: number }>> {
    const { data: usuario } = await supabase
      .from('usuarios').select('rol').eq('id', input.adminId).single()
    if (!usuario || !['admin', 'supervisor'].includes(usuario.rol)) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo admin o supervisor puede registrar devoluciones' } }
    }

    const { data: nota } = await supabase
      .from('notas_venta').select('numero_nota').eq('id', input.notaId).single()
    const numeroNota = nota?.numero_nota ?? ''

    const hoy = new Date().toISOString().slice(0, 10)
    let procesados = 0

    // Crear cabecera en tabla devoluciones
    const { data: devRow, error: errorDev } = await supabase
      .from('devoluciones')
      .insert({ nota_venta_id: input.notaId, usuario_id: input.adminId, motivo: input.comentario })
      .select('id')
      .single()

    if (errorDev || !devRow) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorDev?.message ?? 'Error al crear devolución' } }
    }

    for (const item of input.items) {
      if (item.cantidad <= 0) continue

      const { data: prod } = await supabase
        .from('productos').select('sku, nombre').eq('id', item.productoId).single()

      // Reingresar al inventario con tipo_origen correcto
      const { error: errorLote } = await supabase.from('lotes_inventario').insert({
        producto_id:            item.productoId,
        cantidad:               item.cantidad,
        fecha_ingreso:          hoy,
        posicion_id:            null,
        pasillo_id:             null,
        en_pasillo:             false,
        importacion_id:         null,
        importacion_detalle_id: null,
        tipo_origen:            'devolucion',
      })

      if (errorLote) return { ok: false, error: { code: 'DB_ERROR', message: errorLote.message } }

      // Registrar ítem en tabla devolucion_items
      await supabase.from('devolucion_items').insert({
        devolucion_id: devRow.id,
        producto_id:   item.productoId,
        cantidad:      item.cantidad,
        posicion_id:   null,
      })

      // Registrar en movimientos para historial
      await supabase.from('movimientos').insert({
        tipo:          'devolucion',
        nota_venta_id: input.notaId,
        producto_id:   item.productoId,
        cantidad:      item.cantidad,
        usuario_id:    input.adminId,
        detalle: {
          numeroNota,
          sku:            prod?.sku ?? '',
          nombreProducto: prod?.nombre ?? '',
          cantidad:       item.cantidad,
        },
      })

      procesados++
    }

    return { ok: true, data: { procesados } }
  },
}
