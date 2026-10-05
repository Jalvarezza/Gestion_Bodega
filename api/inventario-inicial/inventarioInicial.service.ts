import { supabase }       from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'

export type InfoPosicion = {
  id:        string
  codigo:    string
  nivel:     number
  posicion:  string
  ocupada:   boolean
  rackCodigo:   string
  pasilloCodigo: string
}

export type InfoProducto = {
  id:     string
  sku:    string
  nombre: string
}

export type RegistroLoteResult = {
  loteId:      string
  posicion:    string
  skuProducto: string
  cantidad:    number
}

export const inventarioInicialService = {

  // Resuelve una posición por su código (escaneado del QR)
  async resolverPosicion(codigo: string): Promise<ServiceResult<InfoPosicion>> {
    const { data, error } = await supabase
      .from('posiciones_rack')
      .select(`
        id, codigo, nivel, posicion, ocupada,
        racks!inner(codigo, pasillos!inner(codigo))
      `)
      .eq('codigo', codigo.trim().toUpperCase())
      .single()

    if (error || !data) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Posición "${codigo}" no encontrada. Verifica que el código esté correcto.` } }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rack    = (data as any).racks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pasillo = rack?.pasillos

    return {
      ok: true,
      data: {
        id:            data.id,
        codigo:        data.codigo,
        nivel:         data.nivel,
        posicion:      data.posicion,
        ocupada:       data.ocupada,
        rackCodigo:    rack?.codigo    ?? '',
        pasilloCodigo: pasillo?.codigo ?? '',
      },
    }
  },

  // Resuelve un producto por su código de barras
  async resolverProducto(codigoBarra: string): Promise<ServiceResult<InfoProducto>> {
    const { data, error } = await supabase
      .from('productos')
      .select('id, sku, nombre')
      .eq('codigo_barra', codigoBarra.trim())
      .single()

    if (error || !data) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Producto con código de barra "${codigoBarra.trim()}" no encontrado en el sistema.` } }
    }

    return { ok: true, data: { id: data.id, sku: data.sku, nombre: data.nombre } }
  },

  // Busca el lote activo de una posición ocupada
  async buscarLotePorPosicion(codigoPosicion: string): Promise<ServiceResult<{ loteId: string; skuProducto: string; nombreProducto: string; posicionCodigo: string; posicionId: string }>> {
    const { data: posicion, error: errorPos } = await supabase
      .from('posiciones_rack')
      .select('id, codigo')
      .eq('codigo', codigoPosicion.trim().toUpperCase())
      .single()

    if (errorPos || !posicion) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Posición "${codigoPosicion}" no encontrada.` } }
    }

    const { data: lote, error: errorLote } = await supabase
      .from('lotes_inventario')
      .select('id, producto_id')
      .eq('posicion_id', posicion.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (errorLote || !lote) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `La posición ${posicion.codigo} no tiene productos asignados.` } }
    }

    const { data: prod } = await supabase
      .from('productos')
      .select('sku, nombre')
      .eq('id', lote.producto_id)
      .single()

    return {
      ok: true,
      data: {
        loteId:         lote.id,
        skuProducto:    prod?.sku    ?? '—',
        nombreProducto: prod?.nombre ?? '—',
        posicionCodigo: posicion.codigo,
        posicionId:     posicion.id,
      },
    }
  },

  // Elimina un lote y libera la posición
  async eliminarLote(loteId: string): Promise<ServiceResult<{ ok: true }>> {
    const { data: lote, error: errorLote } = await supabase
      .from('lotes_inventario')
      .select('id, posicion_id')
      .eq('id', loteId)
      .single()

    if (errorLote || !lote) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Lote no encontrado.' } }
    }

    const { error: errorDel } = await supabase
      .from('lotes_inventario')
      .delete()
      .eq('id', loteId)

    if (errorDel) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorDel.message } }
    }

    if (lote.posicion_id) {
      await supabase.from('posiciones_rack').update({ ocupada: false }).eq('id', lote.posicion_id)
    }

    return { ok: true, data: { ok: true } }
  },

  // Registra el lote en la posición
  async registrarLote(input: {
    usuarioId:    string
    posicionId:   string
    productoId:   string
    cantidad:     number
    fechaIngreso: string
  }): Promise<ServiceResult<RegistroLoteResult>> {

    // Re-verificar posición para obtener código y estado actual
    const { data: posicion, error: errorPos } = await supabase
      .from('posiciones_rack')
      .select('id, codigo, ocupada')
      .eq('id', input.posicionId)
      .single()

    if (errorPos || !posicion) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Posición no encontrada.' } }
    }

    if (posicion.ocupada) {
      return { ok: false, error: { code: 'CONFLICT', message: `La posición ${posicion.codigo} ya tiene stock registrado.` } }
    }

    const { data: producto, error: errorProd } = await supabase
      .from('productos')
      .select('id, sku, nombre')
      .eq('id', input.productoId)
      .single()

    if (errorProd || !producto) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' } }
    }

    // Crear lote sin importación
    const { data: lote, error: errorLote } = await supabase
      .from('lotes_inventario')
      .insert({
        producto_id:            producto.id,
        cantidad:               input.cantidad,
        fecha_ingreso:          input.fechaIngreso,
        posicion_id:            posicion.id,
        pasillo_id:             null,
        en_pasillo:             false,
        tipo_origen:            'ajuste_directo',
        importacion_id:         null,
        importacion_detalle_id: null,
      })
      .select()
      .single()

    if (errorLote || !lote) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorLote?.message ?? 'Error al crear lote.' } }
    }

    // Marcar posición como ocupada
    await supabase.from('posiciones_rack').update({ ocupada: true }).eq('id', posicion.id)

    // stock_total se recalcula automáticamente vía trigger trg_recalcular_stock al insertar el lote

    // Auditoría
    await supabase.from('movimientos').insert({
      tipo:        'ingreso',
      producto_id: producto.id,
      lote_id:     lote.id,
      cantidad:    input.cantidad,
      usuario_id:  input.usuarioId,
      detalle: {
        tipo:              'inventario_inicial',
        sku:               producto.sku,
        nombreProducto:    producto.nombre,
        ubicacion:         posicion.codigo,
        fechaIngreso:      input.fechaIngreso,
        cantidadIngresada: input.cantidad,
      },
    })

    return {
      ok: true,
      data: {
        loteId:      lote.id,
        posicion:    posicion.codigo,
        skuProducto: producto.sku,
        cantidad:    input.cantidad,
      },
    }
  },
}
