import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'
import type { Database } from '../lib/supabase/types'

type LoteInventario = Database['public']['Tables']['lotes_inventario']['Row']
type Posicion       = Database['public']['Tables']['posiciones_rack']['Row']

type PosicionDisponible = { posicionId: string; codigo: string }

export type IniciarReubicacionInput = {
  usuarioId:            string
  posicionOrigenCodigo: string
  productoCodigo:       string
}

export type IniciarReubicacionResult = {
  loteId:                string
  productoId:            string
  sku:                   string
  nombre:                string
  cantidad:              number
  posicionOrigen:        string
  posicionesDisponibles: PosicionDisponible[]
}

export type ConfirmarReubicacionInput = {
  usuarioId:             string
  loteId:                string
  posicionDestinoCodigo: string
  posicionDestinoId:     string
}

export type ConfirmarReubicacionResult = {
  trasladoId:      string
  loteId:          string
  posicionOrigen:  string
  posicionDestino: string
  mensaje:         'Producto re-ubicado correctamente'
}

export type IniciarIntercambioInput = {
  usuarioId:            string
  posicionOrigenCodigo: string
  productoOrigenCodigo: string
}

export type IniciarIntercambioResult = {
  loteOrigenId:   string
  productoOrigen: string
  posicionOrigen: string
}

export type SeleccionarDestinoInput = {
  usuarioId:             string
  loteOrigenId:          string
  posicionDestinoCodigo: string
  productoDestinoCodigo: string
}

export type SeleccionarDestinoResult = {
  loteOrigenId:    string
  loteDestinoId:   string
  productoOrigen:  string
  productoDestino: string
  posicionOrigen:  string
  posicionDestino: string
  mensaje:         'Cambio permitido'
}

export type ConfirmarIntercambioInput = {
  usuarioId:              string
  loteOrigenId:           string
  loteDestinoId:          string
  codigoRackOrigenFinal:  string
  codigoRackDestinoFinal: string
}

export type ConfirmarIntercambioResult = {
  trasladoId:      string
  posicionOrigen:  string
  posicionDestino: string
  mensaje:         'Cambio exitoso'
}

// ── Helper: buscar posición activa por código ─────────────────────────────

async function buscarPosicionPorCodigo(codigo: string): Promise<Posicion | null> {
  const { data } = await supabase
    .from('posiciones_rack')
    .select('*')
    .eq('codigo', codigo)
    .eq('activo', true)
    .single()
  return data ?? null
}

// ── Helper: buscar lote activo en una posición ────────────────────────────

async function buscarLoteEnPosicion(
  posicionId: string
): Promise<(LoteInventario & { productos: { codigo_barra: string; sku: string; nombre: string; alto_cm: number; largo_cm: number; ancho_cm: number } | null }) | null> {
  const { data } = await supabase
    .from('lotes_inventario')
    .select('*, productos(codigo_barra, sku, nombre, alto_cm, largo_cm, ancho_cm)')
    .eq('posicion_id', posicionId)
    .eq('activo', true)
    .gt('cantidad', 0)
    .single()
  return data ?? null
}

// ── Service ───────────────────────────────────────────────────────────────

export const trasladosService = {
  async obtenerRacksDisponibles(): Promise<ServiceResult<PosicionDisponible[]>> {
    const { data, error } = await supabase
      .from('posiciones_rack')
      .select('id, codigo, racks(codigo, pasillos(nombre))')
      .eq('ocupada', false)
      .eq('activo', true)
      .order('codigo')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const result: PosicionDisponible[] = (data ?? []).map((p) => ({
      posicionId: p.id,
      codigo: p.codigo,
    }))

    return { ok: true, data: result }
  },

  async iniciarReubicacion(input: IniciarReubicacionInput): Promise<ServiceResult<IniciarReubicacionResult>> {
    // Buscar posición origen por código escaneado
    const posicion = await buscarPosicionPorCodigo(input.posicionOrigenCodigo)
    if (!posicion) {
      return { ok: false, error: { code: 'INVALID_RACK', message: 'El rack escaneado no existe o está inactivo', field: 'posicionOrigenCodigo' } }
    }

    // Buscar lote en esa posición y validar que el producto escaneado coincide
    const lote = await buscarLoteEnPosicion(posicion.id)
    if (!lote || !lote.productos) {
      return { ok: false, error: { code: 'INVALID_PRODUCTO', message: 'No hay producto activo en el rack escaneado', field: 'productoCodigo' } }
    }

    if (lote.productos.codigo_barra !== input.productoCodigo) {
      return {
        ok: false,
        error: { code: 'INVALID_PRODUCTO', message: `El producto escaneado no coincide con el rack. Esperado: ${lote.productos.sku}`, field: 'productoCodigo' },
      }
    }

    // TC-TRS-007: buscar posiciones vacías disponibles
    const { data: posicionesLibres, error: errorPosiciones } = await supabase
      .from('posiciones_rack')
      .select('id, codigo, alto_cm, largo_cm, ancho_cm')
      .eq('ocupada', false)
      .eq('activo', true)
      .neq('id', posicion.id)
      .order('codigo')

    if (errorPosiciones) return { ok: false, error: { code: 'DB_ERROR', message: errorPosiciones.message } }

    if (!posicionesLibres || posicionesLibres.length === 0) {
      return { ok: false, error: { code: 'NO_SPACE_AVAILABLE', message: 'No hay posiciones vacías disponibles en la bodega' } }
    }

    // Filtrar posiciones donde el producto realmente cabe (cubicaje)
    const prod = lote.productos
    function cabeEnPosicion(pos: { alto_cm: number; largo_cm: number; ancho_cm: number }): boolean {
      if (!prod || !prod.alto_cm || !prod.largo_cm || !prod.ancho_cm) return true
      const capacidad =
        Math.floor(pos.alto_cm  / prod.alto_cm)  *
        Math.floor(pos.largo_cm / prod.largo_cm) *
        Math.floor(pos.ancho_cm / prod.ancho_cm)
      return capacidad >= lote.cantidad
    }

    const posicionesCompatibles = posicionesLibres.filter(cabeEnPosicion)

    if (posicionesCompatibles.length === 0) {
      return { ok: false, error: { code: 'NO_SPACE_AVAILABLE', message: 'No hay posiciones con capacidad suficiente para este producto' } }
    }

    return {
      ok: true,
      data: {
        loteId:                lote.id,
        productoId:            lote.producto_id,
        sku:                   lote.productos.sku,
        nombre:                lote.productos.nombre,
        cantidad:              lote.cantidad,
        posicionOrigen:        posicion.codigo,
        posicionesDisponibles: posicionesCompatibles.map((p) => ({ posicionId: p.id, codigo: p.codigo })),
      },
    }
  },

  async confirmarReubicacion(input: ConfirmarReubicacionInput): Promise<ServiceResult<ConfirmarReubicacionResult>> {
    // Obtener lote con datos enriquecidos para auditoría
    const { data: lote, error: errorLote } = await supabase
      .from('lotes_inventario')
      .select('*, productos(sku, nombre, alto_cm, largo_cm, ancho_cm), posiciones_rack(codigo)')
      .eq('id', input.loteId)
      .eq('activo', true)
      .single()

    if (errorLote || !lote) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Lote no encontrado', field: 'loteId' } }
    }

    // Obtener posición destino y verificar que el código escaneado coincide
    const { data: posicionDestino, error: errorPD } = await supabase
      .from('posiciones_rack')
      .select('*')
      .eq('id', input.posicionDestinoId)
      .single()

    if (errorPD || !posicionDestino) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Posición destino no encontrada', field: 'posicionDestinoId' } }
    }

    if (posicionDestino.codigo !== input.posicionDestinoCodigo) {
      return { ok: false, error: { code: 'INVALID_RACK', message: 'El rack escaneado no coincide con el seleccionado', field: 'posicionDestinoCodigo' } }
    }

    // MD-013: verificar concurrencia — posición podría haber sido ocupada
    if (posicionDestino.ocupada) {
      return { ok: false, error: { code: 'CONFLICT_POSICION_OCUPADA', message: 'La posición destino fue ocupada por otro operador' } }
    }

    // Verificar cubicaje: el producto debe caber físicamente en la posición destino
    type ProductoDims = { sku: string; nombre: string; alto_cm: number; largo_cm: number; ancho_cm: number } | null
    const prodDims = lote.productos as ProductoDims
    if (prodDims && prodDims.alto_cm > 0 && prodDims.largo_cm > 0 && prodDims.ancho_cm > 0) {
      const capacidad =
        Math.floor(posicionDestino.alto_cm  / prodDims.alto_cm)  *
        Math.floor(posicionDestino.largo_cm / prodDims.largo_cm) *
        Math.floor(posicionDestino.ancho_cm / prodDims.ancho_cm)
      if (lote.cantidad > capacidad) {
        return { ok: false, error: { code: 'CAPACITY_EXCEEDED', message: `La posición solo tiene capacidad para ${capacidad} unidades y el lote tiene ${lote.cantidad}` } }
      }
    }

    type PosicionRef = { codigo: string } | null
    type ProductoRef = { sku: string; nombre: string } | null
    const posicionOrigenCodigo = (lote.posiciones_rack as PosicionRef)?.codigo ?? ''
    const productoRef = lote.productos as ProductoRef
    const posicionOrigenId = lote.posicion_id!

    // Mover lote a posición destino
    const { error: errorLoteUpdate } = await supabase
      .from('lotes_inventario')
      .update({ posicion_id: input.posicionDestinoId })
      .eq('id', input.loteId)

    if (errorLoteUpdate) return { ok: false, error: { code: 'DB_ERROR', message: errorLoteUpdate.message } }

    // MD-013: actualizar posiciones en la misma operación lógica
    await supabase.from('posiciones_rack').update({ ocupada: false }).eq('id', posicionOrigenId)
    await supabase.from('posiciones_rack').update({ ocupada: true }).eq('id', input.posicionDestinoId)

    // Registrar en tabla traslados
    const { data: traslado, error: errorTraslado } = await supabase
      .from('traslados')
      .insert({
        tipo:               'reubicacion',
        lote_origen_id:     input.loteId,
        lote_destino_id:    null,
        producto_origen_id: lote.producto_id,
        producto_destino_id: null,
        posicion_origen_id:  posicionOrigenId,
        posicion_destino_id: input.posicionDestinoId,
        realizado_por:       input.usuarioId,
      })
      .select()
      .single()

    if (errorTraslado || !traslado) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorTraslado?.message ?? 'Error al registrar traslado' } }
    }

    // EV-001: movimiento de auditoría
    await supabase.from('movimientos').insert({
      tipo:       'traslado_reubicacion',
      traslado_id: traslado.id,
      lote_id:     input.loteId,
      producto_id: lote.producto_id,
      usuario_id:  input.usuarioId,
      detalle: {
        sku:            productoRef?.sku ?? '',
        nombreProducto: productoRef?.nombre ?? '',
        posicionOrigen:  posicionOrigenCodigo,
        posicionDestino: posicionDestino.codigo,
        cantidad:        lote.cantidad,
      },
    })

    return {
      ok: true,
      data: {
        trasladoId:      traslado.id,
        loteId:          input.loteId,
        posicionOrigen:  posicionOrigenCodigo,
        posicionDestino: posicionDestino.codigo,
        mensaje:         'Producto re-ubicado correctamente',
      },
    }
  },

  async iniciarIntercambio(input: IniciarIntercambioInput): Promise<ServiceResult<IniciarIntercambioResult>> {
    const posicion = await buscarPosicionPorCodigo(input.posicionOrigenCodigo)
    if (!posicion) {
      return { ok: false, error: { code: 'INVALID_RACK', message: 'El rack escaneado no existe o está inactivo', field: 'posicionOrigenCodigo' } }
    }

    const lote = await buscarLoteEnPosicion(posicion.id)
    if (!lote || !lote.productos) {
      return { ok: false, error: { code: 'INVALID_PRODUCTO', message: 'No hay producto activo en el rack escaneado', field: 'productoOrigenCodigo' } }
    }

    if (lote.productos.codigo_barra !== input.productoOrigenCodigo) {
      return {
        ok: false,
        error: { code: 'INVALID_PRODUCTO', message: `El producto escaneado no coincide con el rack. Esperado: ${lote.productos.sku}`, field: 'productoOrigenCodigo' },
      }
    }

    return {
      ok: true,
      data: {
        loteOrigenId:   lote.id,
        productoOrigen: lote.productos.sku,
        posicionOrigen: posicion.codigo,
      },
    }
  },

  async seleccionarDestinoIntercambio(input: SeleccionarDestinoInput): Promise<ServiceResult<SeleccionarDestinoResult>> {
    // Verificar lote origen
    const { data: loteOrigen, error: errorLO } = await supabase
      .from('lotes_inventario')
      .select('*, productos(codigo_barra, sku, alto_cm, largo_cm, ancho_cm), posiciones_rack(codigo, alto_cm, largo_cm, ancho_cm)')
      .eq('id', input.loteOrigenId)
      .eq('activo', true)
      .single()

    if (errorLO || !loteOrigen) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Lote origen no encontrado', field: 'loteOrigenId' } }
    }

    // Buscar posición destino por código escaneado
    const posicionDestino = await buscarPosicionPorCodigo(input.posicionDestinoCodigo)
    if (!posicionDestino) {
      return { ok: false, error: { code: 'INVALID_RACK', message: 'El rack destino no existe o está inactivo', field: 'posicionDestinoCodigo' } }
    }

    // Buscar lote en posición destino y validar producto
    const loteDestino = await buscarLoteEnPosicion(posicionDestino.id)
    if (!loteDestino || !loteDestino.productos) {
      return { ok: false, error: { code: 'INVALID_PRODUCTO', message: 'No hay producto activo en el rack destino', field: 'productoDestinoCodigo' } }
    }

    if (loteDestino.productos.codigo_barra !== input.productoDestinoCodigo) {
      return {
        ok: false,
        error: { code: 'INVALID_PRODUCTO', message: `El producto destino no coincide con el rack. Esperado: ${loteDestino.productos.sku}`, field: 'productoDestinoCodigo' },
      }
    }

    type PosicionRef = { codigo: string; alto_cm: number; largo_cm: number; ancho_cm: number } | null
    type ProductoRef = { sku: string; alto_cm: number; largo_cm: number; ancho_cm: number } | null

    const prodOrigen  = loteOrigen.productos as ProductoRef
    const posOrigen   = loteOrigen.posiciones_rack as PosicionRef
    const prodDestino = loteDestino.productos as ProductoRef

    // Verificar cubicaje cruzado: origen cabe en destino y destino cabe en origen
    function capacidad(pos: { alto_cm: number; largo_cm: number; ancho_cm: number }, prod: { alto_cm: number; largo_cm: number; ancho_cm: number } | null): number {
      if (!prod || !prod.alto_cm || !prod.largo_cm || !prod.ancho_cm) return Infinity
      return Math.floor(pos.alto_cm / prod.alto_cm) * Math.floor(pos.largo_cm / prod.largo_cm) * Math.floor(pos.ancho_cm / prod.ancho_cm)
    }

    if (prodOrigen && posicionDestino.alto_cm) {
      const capOrigenEnDestino = capacidad(posicionDestino, prodOrigen)
      if (loteOrigen.cantidad > capOrigenEnDestino) {
        return { ok: false, error: { code: 'CAPACITY_EXCEEDED', message: `El producto origen no cabe en la posición destino (capacidad: ${capOrigenEnDestino} uds)` } }
      }
    }

    if (prodDestino && posOrigen) {
      const capDestinoEnOrigen = capacidad(posOrigen, prodDestino)
      if (loteDestino.cantidad > capDestinoEnOrigen) {
        return { ok: false, error: { code: 'CAPACITY_EXCEEDED', message: `El producto destino no cabe en la posición origen (capacidad: ${capDestinoEnOrigen} uds)` } }
      }
    }

    return {
      ok: true,
      data: {
        loteOrigenId:    loteOrigen.id,
        loteDestinoId:   loteDestino.id,
        productoOrigen:  prodOrigen?.sku ?? '',
        productoDestino: loteDestino.productos.sku,
        posicionOrigen:  posOrigen?.codigo ?? '',
        posicionDestino: posicionDestino.codigo,
        mensaje:         'Cambio permitido',
      },
    }
  },

  async confirmarIntercambio(input: ConfirmarIntercambioInput): Promise<ServiceResult<ConfirmarIntercambioResult>> {
    // Obtener ambos lotes con datos completos para auditoría
    const [{ data: loteOrigen, error: errorLO }, { data: loteDestino, error: errorLD }] = await Promise.all([
      supabase
        .from('lotes_inventario')
        .select('*, productos(sku, nombre, alto_cm, largo_cm, ancho_cm), posiciones_rack(codigo, alto_cm, largo_cm, ancho_cm)')
        .eq('id', input.loteOrigenId)
        .eq('activo', true)
        .single(),
      supabase
        .from('lotes_inventario')
        .select('*, productos(sku, nombre, alto_cm, largo_cm, ancho_cm), posiciones_rack(codigo, alto_cm, largo_cm, ancho_cm)')
        .eq('id', input.loteDestinoId)
        .eq('activo', true)
        .single(),
    ])

    if (errorLO || !loteOrigen) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Lote origen no encontrado', field: 'loteOrigenId' } }
    }
    if (errorLD || !loteDestino) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Lote destino no encontrado', field: 'loteDestinoId' } }
    }

    type PosicionRef = { codigo: string; alto_cm: number; largo_cm: number; ancho_cm: number } | null
    type ProductoRef = { sku: string; nombre: string; alto_cm: number; largo_cm: number; ancho_cm: number } | null

    const posOrigenRef    = loteOrigen.posiciones_rack  as PosicionRef
    const posDestinoRef   = loteDestino.posiciones_rack as PosicionRef
    const posOrigenCodigo  = posOrigenRef?.codigo  ?? ''
    const posDestinoCodigo = posDestinoRef?.codigo ?? ''

    // Validar escaneos de confirmación
    if (input.codigoRackOrigenFinal !== posOrigenCodigo) {
      return { ok: false, error: { code: 'INVALID_RACK', message: 'El rack origen escaneado no coincide', field: 'codigoRackOrigenFinal' } }
    }
    if (input.codigoRackDestinoFinal !== posDestinoCodigo) {
      return { ok: false, error: { code: 'INVALID_RACK', message: 'El rack destino escaneado no coincide', field: 'codigoRackDestinoFinal' } }
    }

    // Verificar que las posiciones no cambiaron (CONFLICT_CONCURRENCIA)
    const posicionOrigenId  = loteOrigen.posicion_id
    const posicionDestinoId = loteDestino.posicion_id

    if (!posicionOrigenId || !posicionDestinoId) {
      return { ok: false, error: { code: 'CONFLICT_CONCURRENCIA', message: 'Uno de los lotes fue modificado por otra operación' } }
    }

    // Verificar cubicaje cruzado (segunda línea de defensa por concurrencia)
    const prodOrigenRef  = loteOrigen.productos  as ProductoRef
    const prodDestinoRef = loteDestino.productos as ProductoRef

    function capCruzada(pos: PosicionRef, prod: ProductoRef): number {
      if (!pos || !prod || !prod.alto_cm || !prod.largo_cm || !prod.ancho_cm) return Infinity
      return Math.floor(pos.alto_cm / prod.alto_cm) * Math.floor(pos.largo_cm / prod.largo_cm) * Math.floor(pos.ancho_cm / prod.ancho_cm)
    }

    if (loteOrigen.cantidad > capCruzada(posDestinoRef, prodOrigenRef)) {
      return { ok: false, error: { code: 'CAPACITY_EXCEEDED', message: 'El producto origen ya no cabe en la posición destino' } }
    }
    if (loteDestino.cantidad > capCruzada(posOrigenRef, prodDestinoRef)) {
      return { ok: false, error: { code: 'CAPACITY_EXCEEDED', message: 'El producto destino ya no cabe en la posición origen' } }
    }

    // Ejecutar swap de posiciones entre lotes
    const [{ error: errorSwapO }, { error: errorSwapD }] = await Promise.all([
      supabase.from('lotes_inventario').update({ posicion_id: posicionDestinoId }).eq('id', input.loteOrigenId),
      supabase.from('lotes_inventario').update({ posicion_id: posicionOrigenId }).eq('id', input.loteDestinoId),
    ])

    if (errorSwapO) return { ok: false, error: { code: 'DB_ERROR', message: errorSwapO.message } }
    if (errorSwapD) return { ok: false, error: { code: 'DB_ERROR', message: errorSwapD.message } }

    // Las posiciones siguen ocupadas (ambas) — no hay cambio en posiciones_rack.ocupada

    // Registrar en tabla traslados (EVT-006: único registro documenta ambos lados)
    const { data: traslado, error: errorTraslado } = await supabase
      .from('traslados')
      .insert({
        tipo:                'intercambio',
        lote_origen_id:      input.loteOrigenId,
        lote_destino_id:     input.loteDestinoId,
        producto_origen_id:  loteOrigen.producto_id,
        producto_destino_id: loteDestino.producto_id,
        posicion_origen_id:  posicionOrigenId,
        posicion_destino_id: posicionDestinoId,
        realizado_por:       input.usuarioId,
      })
      .select()
      .single()

    if (errorTraslado || !traslado) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorTraslado?.message ?? 'Error al registrar traslado' } }
    }

    // EV-001 + EVT-006: movimiento único con detalle de ambos lados
    const prodOrigen  = loteOrigen.productos as ProductoRef
    const prodDestino = loteDestino.productos as ProductoRef

    await supabase.from('movimientos').insert({
      tipo:        'traslado_intercambio',
      traslado_id:  traslado.id,
      lote_id:      input.loteOrigenId,
      producto_id:  loteOrigen.producto_id,
      usuario_id:   input.usuarioId,
      cantidad:     null,
      detalle: {
        origen: {
          sku:            prodOrigen?.sku ?? '',
          nombreProducto: prodOrigen?.nombre ?? '',
          posicion:        posOrigenCodigo,
          cantidad:        loteOrigen.cantidad,
        },
        destino: {
          sku:            prodDestino?.sku ?? '',
          nombreProducto: prodDestino?.nombre ?? '',
          posicion:        posDestinoCodigo,
          cantidad:        loteDestino.cantidad,
        },
      },
    })

    return {
      ok: true,
      data: {
        trasladoId:      traslado.id,
        posicionOrigen:  posOrigenCodigo,
        posicionDestino: posDestinoCodigo,
        mensaje:         'Cambio exitoso',
      },
    }
  },
}
