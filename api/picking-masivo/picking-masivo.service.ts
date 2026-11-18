// @ts-nocheck
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'

// ── Tipos ──────────────────────────────────────────────────────────────────

export type LineaExcelOC = {
  upc:           string | null
  codigoCliente: string | null   // columna "SKU" del Excel: código interno del cliente
  descripcion:   string
  vin:           string          // columna "VIN" del Excel: SKU del catálogo Grantt
  cantidad:      number
}

export type LineaPrevisualizada = LineaExcelOC & {
  productoId:   string | null
  sku:          string | null
  nombre:       string | null
  encontradoPor: 'vin' | 'upc' | null
}

export type OrdenResumen = {
  id:               string
  numeroOc:         string
  nombreCliente:    string | null
  estado:           string
  totalLineas:      number
  lineasResueltas:  number
  unidadesPedidas:  number
  unidadesPickeadas: number
  operadoresActivos: number
  creadoEn:         string
  creadoPorNombre:  string | null
  completadaEn:     string | null
}

export type UbicacionPM = {
  loteId:         string
  posicionCodigo: string
  cantidad:       number
  fechaIngreso:   string
}

export type LineaOrden = {
  id:                 string
  productoId:         string
  sku:                string
  nombre:             string
  codigoCliente:      string | null
  codigoBarra:        string | null
  codigoBarraAlternativo: string | null
  cantidadPedida:     number
  cantidadDespachada: number
  estado:             string
  motivo:             string | null
  tomadoPor:          string | null
  tomadoPorNombre:    string | null
  ubicaciones:        UbicacionPM[]
}

export type OrdenDetalle = Omit<OrdenResumen, 'operadoresActivos' | 'creadoPorNombre'> & { lineas: LineaOrden[] }

const ESTADOS_RESUELTOS = ['completado', 'parcial', 'sin_stock']
const MINUTOS_ABANDONO  = 10

// ── Helpers ────────────────────────────────────────────────────────────────

async function rolDe(usuarioId: string): Promise<string | null> {
  const { data } = await supabase.from('usuarios').select('rol').eq('id', usuarioId).single()
  return data?.rol ?? null
}

const norm = (s: unknown) => String(s ?? '').trim().toUpperCase()
const normBarra = (s: unknown) => norm(s).replace(/^0+/, '')

// Libera líneas tomadas sin actividad reciente (el operador se fue sin terminar)
async function liberarLineasAbandonadas() {
  const limite = new Date(Date.now() - MINUTOS_ABANDONO * 60_000).toISOString()
  await supabase
    .from('items_picking_masivo')
    .update({ estado: 'libre', tomado_por: null, tomado_en: null })
    .eq('estado', 'en_progreso')
    .lt('tomado_en', limite)
}

const aUbicacion = (l: any): UbicacionPM => ({
  loteId:         l.id,
  posicionCodigo: l.posiciones_rack?.codigo ?? '',
  cantidad:       l.cantidad,
  fechaIngreso:   l.fecha_ingreso,
})

function consultaLotes() {
  return supabase
    .from('lotes_inventario')
    .select('id, producto_id, cantidad, fecha_ingreso, posiciones_rack(codigo)')
    .eq('activo', true)
    .gt('cantidad', 0)
    .not('posicion_id', 'is', null)
    .order('fecha_ingreso', { ascending: true })
    .order('created_at', { ascending: true })
}

async function ubicacionesFifo(productoId: string): Promise<UbicacionPM[]> {
  const { data } = await consultaLotes().eq('producto_id', productoId)
  return (data ?? []).map(aUbicacion)
}

// Una consulta por bloque de productos en vez de una por línea: la OC puede traer cientos de líneas
async function ubicacionesFifoPorProducto(productoIds: string[]): Promise<Map<string, UbicacionPM[]>> {
  const unicos = [...new Set(productoIds)]
  const bloques: string[][] = []
  for (let i = 0; i < unicos.length; i += 60) bloques.push(unicos.slice(i, i + 60))
  const resultados = await Promise.all(bloques.map((ids) => consultaLotes().in('producto_id', ids)))
  const mapa = new Map<string, UbicacionPM[]>()
  for (const { data } of resultados) {
    for (const l of data ?? []) {
      if (!mapa.has(l.producto_id)) mapa.set(l.producto_id, [])
      mapa.get(l.producto_id).push(aUbicacion(l))
    }
  }
  return mapa
}

// Recalcula el avance de la OC y la cierra cuando todas sus líneas quedan resueltas
async function actualizarAvanceOrden(sesionId: string, usuarioId: string) {
  const { data: items } = await supabase
    .from('items_picking_masivo')
    .select('estado')
    .eq('sesion_id', sesionId)
  const resueltas = (items ?? []).filter((i) => ESTADOS_RESUELTOS.includes(i.estado)).length
  const completa  = (items ?? []).length > 0 && resueltas === (items ?? []).length

  const { data: sesion } = await supabase
    .from('sesiones_picking_masivo')
    .update({
      items_completados: resueltas,
      ...(completa ? { estado: 'completada', completada_en: new Date().toISOString() } : {}),
    })
    .eq('id', sesionId)
    .eq('estado', 'activa')
    .select('numero_oc, nombre_cliente')
    .maybeSingle()

  if (completa && sesion) {
    await supabase.from('movimientos').insert({
      tipo:       'cambio_estado_nota',
      usuario_id: usuarioId,
      detalle: {
        tipoDocumento:  'orden_compra',
        sesionId,
        numeroOc:       sesion.numero_oc,
        nombreCliente:  sesion.nombre_cliente,
        estadoAnterior: 'activa',
        estadoNuevo:    'completada',
      },
    })
  }
  return completa
}

// ── Service ────────────────────────────────────────────────────────────────

export const pickingMasivoService = {

  // Cruza las líneas del Excel con el catálogo: VIN = SKU Grantt; UPC como respaldo
  async previsualizar(lineas: LineaExcelOC[]): Promise<ServiceResult<LineaPrevisualizada[]>> {
    const { data: productos, error } = await supabase
      .from('productos')
      .select('id, sku, nombre, codigo_barra, codigo_barra_alternativo')
      .eq('activo', true)
      .range(0, 5000)
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const porSku   = new Map((productos ?? []).map((p) => [norm(p.sku), p]))
    const porBarra = new Map<string, any>()
    for (const p of productos ?? []) {
      for (const c of [p.codigo_barra, p.codigo_barra_alternativo]) if (c) porBarra.set(normBarra(c), p)
    }

    const resultado = lineas.map((l) => {
      const porVin = porSku.get(norm(l.vin))
      const porUpc = !porVin && l.upc ? porBarra.get(normBarra(l.upc)) : null
      const p = porVin ?? porUpc ?? null
      return {
        ...l,
        productoId:    p?.id ?? null,
        sku:           p?.sku ?? null,
        nombre:        p?.nombre ?? null,
        encontradoPor: porVin ? 'vin' : porUpc ? 'upc' : null,
      } as LineaPrevisualizada
    })
    return { ok: true, data: resultado }
  },

  async crearOrden(input: {
    usuarioId: string; numeroOc: string; nombreCliente: string; archivoNombre: string | null; lineas: LineaExcelOC[]
  }): Promise<ServiceResult<{ id: string; lineasCreadas: number; lineasOmitidas: number }>> {
    const rol = await rolDe(input.usuarioId)
    if (rol !== 'admin' && rol !== 'supervisor') {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo administrador o supervisor puede cargar órdenes de compra' } }
    }

    const { data: existente } = await supabase
      .from('sesiones_picking_masivo')
      .select('id')
      .eq('numero_oc', input.numeroOc.trim())
      .neq('estado', 'cancelada')
      .limit(1)
    if (existente?.length) {
      return { ok: false, error: { code: 'CONFLICT_OC_DUPLICADA', message: `Ya existe una orden de picking para la OC ${input.numeroOc}` } }
    }

    const prev = await this.previsualizar(input.lineas)
    if (!prev.ok) return prev

    // Una misma referencia repetida en el Excel se suma en una sola línea
    const agrupadas = new Map<string, LineaPrevisualizada>()
    for (const l of prev.data) {
      if (!l.productoId) continue
      const previa = agrupadas.get(l.productoId)
      if (previa) previa.cantidad += l.cantidad
      else agrupadas.set(l.productoId, { ...l })
    }
    const validas = [...agrupadas.values()].filter((l) => l.cantidad > 0)
    if (!validas.length) {
      return { ok: false, error: { code: 'VALIDATION_PRODUCTOS_VACIOS', message: 'Ninguna línea del Excel coincide con el catálogo' } }
    }

    const { data: sesion, error: errSesion } = await supabase
      .from('sesiones_picking_masivo')
      .insert({
        numero_oc:      input.numeroOc.trim(),
        nombre_cliente: input.nombreCliente.trim(),
        archivo_nombre: input.archivoNombre,
        estado:         'activa',
        total_items:    validas.length,
        creado_por:     input.usuarioId,
        activada_en:    new Date().toISOString(),
      })
      .select('id')
      .single()
    if (errSesion || !sesion) return { ok: false, error: { code: 'DB_ERROR', message: errSesion?.message ?? 'Error al crear la orden' } }

    const { error: errItems } = await supabase.from('items_picking_masivo').insert(
      validas.map((l) => ({
        sesion_id:       sesion.id,
        producto_id:     l.productoId,
        codigo:          l.sku,
        codigo_cliente:  l.codigoCliente,
        codigo_barra:    l.upc,
        descripcion:     l.nombre ?? l.descripcion,
        cantidad_pedida: l.cantidad,
        estado:          'libre',
      })),
    )
    if (errItems) {
      await supabase.from('sesiones_picking_masivo').delete().eq('id', sesion.id)
      return { ok: false, error: { code: 'DB_ERROR', message: errItems.message } }
    }

    return { ok: true, data: { id: sesion.id, lineasCreadas: validas.length, lineasOmitidas: input.lineas.length - prev.data.filter((l) => l.productoId).length } }
  },

  async listarOrdenes(): Promise<ServiceResult<OrdenResumen[]>> {
    await liberarLineasAbandonadas()
    const { data, error } = await supabase
      .from('sesiones_picking_masivo')
      .select('id, numero_oc, nombre_cliente, estado, total_items, items_completados, creado_por, creado_en, completada_en, items_picking_masivo(cantidad_pedida, cantidad_despachada, estado, tomado_por)')
      .in('estado', ['activa', 'completada'])
      .order('creado_en', { ascending: false })
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    // creado_por apunta a auth.users, así que el nombre se resuelve aparte en usuarios
    const idsCreadores = [...new Set((data ?? []).map((s: any) => s.creado_por).filter(Boolean))]
    const { data: creadores } = idsCreadores.length
      ? await supabase.from('usuarios').select('id, nombre').in('id', idsCreadores)
      : { data: [] }
    const nombrePorId = new Map((creadores ?? []).map((u) => [u.id, u.nombre]))

    return {
      ok: true,
      data: (data ?? []).map((s: any) => {
        const items = s.items_picking_masivo ?? []
        return {
          id:                s.id,
          numeroOc:          s.numero_oc,
          nombreCliente:     s.nombre_cliente,
          estado:            s.estado,
          totalLineas:       items.length,
          lineasResueltas:   items.filter((i) => ESTADOS_RESUELTOS.includes(i.estado)).length,
          unidadesPedidas:   items.reduce((t, i) => t + i.cantidad_pedida, 0),
          unidadesPickeadas: items.reduce((t, i) => t + i.cantidad_despachada, 0),
          operadoresActivos: new Set(items.filter((i) => i.estado === 'en_progreso').map((i) => i.tomado_por)).size,
          creadoEn:          s.creado_en,
          creadoPorNombre:   nombrePorId.get(s.creado_por) ?? null,
          completadaEn:      s.completada_en,
        }
      }),
    }
  },

  async obtenerOrden(id: string): Promise<ServiceResult<OrdenDetalle>> {
    await liberarLineasAbandonadas()
    const { data: s, error } = await supabase
      .from('sesiones_picking_masivo')
      .select(`id, numero_oc, nombre_cliente, estado, creado_en, completada_en,
        items_picking_masivo(id, producto_id, codigo, codigo_cliente, descripcion, cantidad_pedida, cantidad_despachada, estado, motivo_diferencia, tomado_por,
          tomador:usuarios!items_picking_masivo_tomado_por_fkey(nombre),
          productos(codigo_barra, codigo_barra_alternativo))`)
      .eq('id', id)
      .single()
    if (error || !s) return { ok: false, error: { code: 'NOT_FOUND', message: 'Orden no encontrada' } }

    const items = (s.items_picking_masivo ?? []).sort((a, b) => a.codigo.localeCompare(b.codigo))
    const fifo = await ubicacionesFifoPorProducto(
      items.filter((i: any) => !ESTADOS_RESUELTOS.includes(i.estado)).map((i: any) => i.producto_id))
    const lineas: LineaOrden[] = items.map((i: any) => ({
      id:                     i.id,
      productoId:             i.producto_id,
      sku:                    i.codigo,
      nombre:                 i.descripcion,
      codigoCliente:          i.codigo_cliente,
      codigoBarra:            i.productos?.codigo_barra ?? null,
      codigoBarraAlternativo: i.productos?.codigo_barra_alternativo ?? null,
      cantidadPedida:         i.cantidad_pedida,
      cantidadDespachada:     i.cantidad_despachada,
      estado:                 i.estado,
      motivo:                 i.motivo_diferencia,
      tomadoPor:              i.tomado_por,
      tomadoPorNombre:        i.tomador?.nombre ?? null,
      ubicaciones:            ESTADOS_RESUELTOS.includes(i.estado) ? [] : (fifo.get(i.producto_id) ?? []),
    }))

    return {
      ok: true,
      data: {
        id:                s.id,
        numeroOc:          s.numero_oc,
        nombreCliente:     s.nombre_cliente,
        estado:            s.estado,
        totalLineas:       lineas.length,
        lineasResueltas:   lineas.filter((l) => ESTADOS_RESUELTOS.includes(l.estado)).length,
        unidadesPedidas:   lineas.reduce((t, l) => t + l.cantidadPedida, 0),
        unidadesPickeadas: lineas.reduce((t, l) => t + l.cantidadDespachada, 0),
        creadoEn:          s.creado_en,
        completadaEn:      s.completada_en,
        lineas,
      },
    }
  },

  // Bloqueo atómico de una línea para un operador (un solo UPDATE condicionado)
  async tomarLinea(input: { usuarioId: string; itemId: string }): Promise<ServiceResult<{ itemId: string }>> {
    const [rol, { data: linea }] = await Promise.all([
      rolDe(input.usuarioId),
      supabase.from('items_picking_masivo').select('sesiones_picking_masivo(estado)').eq('id', input.itemId).single(),
    ])
    if (rol !== 'operador') {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo un operador puede hacer picking' } }
    }
    if (!linea) return { ok: false, error: { code: 'NOT_FOUND', message: 'Línea no encontrada' } }
    if (linea.sesiones_picking_masivo?.estado !== 'activa') {
      return { ok: false, error: { code: 'CONFLICT_ESTADO_INVALIDO', message: 'La orden ya no está activa' } }
    }

    const { data: tomada, error } = await supabase
      .from('items_picking_masivo')
      .update({ estado: 'en_progreso', tomado_por: input.usuarioId, tomado_en: new Date().toISOString() })
      .eq('id', input.itemId)
      .or(`estado.eq.libre,and(estado.eq.en_progreso,tomado_por.eq.${input.usuarioId})`)
      .select('id')
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    if (!tomada?.length) {
      const { data: actual } = await supabase
        .from('items_picking_masivo')
        .select('estado, tomador:usuarios!items_picking_masivo_tomado_por_fkey(nombre)')
        .eq('id', input.itemId)
        .single()
      if (actual && ESTADOS_RESUELTOS.includes(actual.estado)) {
        return { ok: false, error: { code: 'LINEA_RESUELTA', message: 'Esta línea ya fue resuelta' } }
      }
      return { ok: false, error: { code: 'LINEA_TOMADA', message: `Esta línea la está preparando ${actual?.tomador?.nombre ?? 'otro operador'}` } }
    }
    return { ok: true, data: { itemId: input.itemId } }
  },

  async liberarLinea(input: { usuarioId: string; itemId: string }): Promise<ServiceResult<{ itemId: string }>> {
    await supabase
      .from('items_picking_masivo')
      .update({ estado: 'libre', tomado_por: null, tomado_en: null })
      .eq('id', input.itemId)
      .eq('estado', 'en_progreso')
      .eq('tomado_por', input.usuarioId)
    return { ok: true, data: { itemId: input.itemId } }
  },

  async registrarPicking(input: {
    usuarioId: string; itemId: string; codigoRack: string; codigoProducto: string
    cantidad: number; loteId?: string; esParadaIntermedia?: boolean; comentario?: string | null
  }): Promise<ServiceResult<{ cantidadDespachada: number; lineaResuelta: boolean; ordenCompleta: boolean }>> {
    const { data: item } = await supabase
      .from('items_picking_masivo')
      .select('*, productos(id, sku, nombre, codigo_barra, codigo_barra_alternativo), sesiones_picking_masivo(id, numero_oc, nombre_cliente, estado)')
      .eq('id', input.itemId)
      .single()
    if (!item) return { ok: false, error: { code: 'NOT_FOUND', message: 'Línea no encontrada' } }

    const orden = item.sesiones_picking_masivo
    const prod  = item.productos
    if (orden?.estado !== 'activa') {
      return { ok: false, error: { code: 'CONFLICT_ESTADO_INVALIDO', message: 'La orden ya no está activa' } }
    }
    if (item.estado !== 'en_progreso' || item.tomado_por !== input.usuarioId) {
      return { ok: false, error: { code: 'LINEA_NO_TOMADA', message: 'Debes tomar la línea antes de registrar el picking' } }
    }

    const barra = normBarra(input.codigoProducto)
    if (barra !== normBarra(prod?.codigo_barra) && barra !== normBarra(prod?.codigo_barra_alternativo)) {
      return { ok: false, error: { code: 'INVALID_PRODUCTO', message: `El producto escaneado no coincide. Esperado: ${prod?.sku}` } }
    }

    const pendiente = item.cantidad_pedida - item.cantidad_despachada
    if (input.cantidad <= 0 || input.cantidad > pendiente) {
      return { ok: false, error: { code: 'EXCEDE_SOLICITADO', message: `No puedes despachar más de lo pedido — pendiente: ${pendiente}` } }
    }
    const quedaPendiente = input.cantidad < pendiente
    if (quedaPendiente && !input.esParadaIntermedia && !input.comentario?.trim()) {
      return { ok: false, error: { code: 'COMENTARIO_REQUERIDO', message: 'Debes indicar el motivo del despacho parcial' } }
    }

    const lotes = await ubicacionesFifo(item.producto_id)
    if (!lotes.length) {
      return { ok: false, error: { code: 'SIN_UBICACION', message: 'El producto no tiene stock en ninguna ubicación. Regístralo como sin stock.' } }
    }
    const lote = (input.loteId && lotes.find((l) => l.loteId === input.loteId)) || lotes[0]
    if (norm(input.codigoRack) !== norm(lote.posicionCodigo)) {
      return { ok: false, error: { code: 'UBICACION_INCORRECTA', message: 'Ubicación incorrecta. Por favor, diríjase al rack asignado' } }
    }

    const { data: descuento, error: errLote } = await supabase.rpc('descontar_lote', { p_lote_id: lote.loteId, p_cantidad: input.cantidad })
    if (errLote) return { ok: false, error: { code: 'DB_ERROR', message: errLote.message } }
    if (!descuento?.ok) return { ok: false, error: { code: 'STOCK_INSUFICIENTE', message: 'Stock insuficiente al momento de registrar. Intenta nuevamente.' } }

    const nuevaDespachada = item.cantidad_despachada + input.cantidad
    const completo        = nuevaDespachada >= item.cantidad_pedida
    const cierraParcial   = !completo && !input.esParadaIntermedia
    const nuevoEstado     = completo ? 'completado' : cierraParcial ? 'parcial' : 'en_progreso'

    await supabase.from('items_picking_masivo').update({
      cantidad_despachada: nuevaDespachada,
      estado:              nuevoEstado,
      tomado_en:           new Date().toISOString(),
      ...(cierraParcial ? { motivo_diferencia: input.comentario?.trim() } : {}),
    }).eq('id', input.itemId)

    if (descuento.cantidad_nueva === 0) {
      await supabase.from('posiciones_rack').update({ ocupada: false }).eq('codigo', lote.posicionCodigo)
    }

    await supabase.from('movimientos').insert({
      tipo:        completo ? 'salida' : 'salida_parcial',
      lote_id:     lote.loteId,
      producto_id: item.producto_id,
      cantidad:    input.cantidad,
      usuario_id:  input.usuarioId,
      detalle: {
        tipoDocumento:      'orden_compra',
        sesionId:           orden.id,
        numeroOc:           orden.numero_oc,
        nombreCliente:      orden.nombre_cliente,
        sku:                prod?.sku,
        nombreProducto:     prod?.nombre,
        cantidadSolicitada: item.cantidad_pedida,
        cantidadDespachada: nuevaDespachada,
        ubicacion:          { rack: lote.posicionCodigo, fechaIngresoLote: lote.fechaIngreso },
        ...(cierraParcial ? { razon: 'parcial_operador', comentarioOperador: input.comentario?.trim() } : {}),
      },
    })

    const resuelta = completo || cierraParcial
    const ordenCompleta = resuelta ? await actualizarAvanceOrden(orden.id, input.usuarioId) : false
    return { ok: true, data: { cantidadDespachada: nuevaDespachada, lineaResuelta: resuelta, ordenCompleta } }
  },

  async registrarSinStock(input: { usuarioId: string; itemId: string; comentario: string }): Promise<ServiceResult<{ ordenCompleta: boolean }>> {
    if (!input.comentario?.trim()) {
      return { ok: false, error: { code: 'VALIDATION_COMENTARIO_VACIO', message: 'El comentario es obligatorio al registrar sin stock' } }
    }
    const { data: item } = await supabase
      .from('items_picking_masivo')
      .select('estado, tomado_por, sesion_id, cantidad_pedida, cantidad_despachada, producto_id, codigo, sesiones_picking_masivo(numero_oc)')
      .eq('id', input.itemId)
      .single()
    if (!item) return { ok: false, error: { code: 'NOT_FOUND', message: 'Línea no encontrada' } }
    if (item.estado !== 'en_progreso' || item.tomado_por !== input.usuarioId) {
      return { ok: false, error: { code: 'LINEA_NO_TOMADA', message: 'Debes tomar la línea antes de marcarla sin stock' } }
    }

    await supabase.from('items_picking_masivo')
      .update({ estado: 'sin_stock', motivo_diferencia: input.comentario.trim() })
      .eq('id', input.itemId)

    await supabase.from('movimientos').insert({
      tipo:        'salida_parcial',
      producto_id: item.producto_id,
      usuario_id:  input.usuarioId,
      detalle: {
        tipoDocumento:      'orden_compra',
        sesionId:           item.sesion_id,
        numeroOc:           item.sesiones_picking_masivo?.numero_oc,
        sku:                item.codigo,
        cantidadSolicitada: item.cantidad_pedida,
        cantidadDespachada: item.cantidad_despachada,
        razon:              'sin_stock',
        comentarioOperador: input.comentario.trim(),
      },
    })

    return { ok: true, data: { ordenCompleta: await actualizarAvanceOrden(item.sesion_id, input.usuarioId) } }
  },

  async cancelarOrden(input: { usuarioId: string; sesionId: string }): Promise<ServiceResult<{ id: string }>> {
    const rol = await rolDe(input.usuarioId)
    if (rol !== 'admin' && rol !== 'supervisor') {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo administrador o supervisor puede cancelar una orden' } }
    }
    const { data } = await supabase
      .from('sesiones_picking_masivo')
      .update({ estado: 'cancelada' })
      .eq('id', input.sesionId)
      .eq('estado', 'activa')
      .select('id')
    if (!data?.length) return { ok: false, error: { code: 'CONFLICT_ESTADO_INVALIDO', message: 'Solo se puede cancelar una orden activa' } }
    return { ok: true, data: { id: input.sesionId } }
  },
}
