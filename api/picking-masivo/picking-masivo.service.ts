// @ts-nocheck
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type CrearSesionInput = {
  usuarioId:       string
  numeroOc:        string
  nombreCliente?:  string
  numeroOcPedido?: string
  archivoNombre:   string
  items: {
    codigo:        string
    descripcion:   string
    cantidadPedida: number
    productoId?:   string
    codigoBarra?:  string
    lpn?:          string
    tienda?:       string
    skuProveedor?: string
  }[]
}

export type EditarParcialInput = {
  subtareaId:         string
  usuarioId:          string
  cantidadDespachada: number
  motivo?:            string
}

export type ValidarExcelInput = {
  items: {
    codigo:        string
    descripcion:   string
    cantidadPedida: number
    codigoBarra?:  string
    lpn?:          string
    skuProveedor?: string
  }[]
}

export type ValidarExcelResult = {
  totalItems:    number
  conCatalogo:   number
  sinCatalogo:   number
  sinStock:      number
  alertas: {
    codigo:       string
    descripcion:  string
    tipo:         'sin_catalogo' | 'sin_stock' | 'stock_insuficiente'
    stockActual?: number
    solicitado?:  number
  }[]
  items: {
    codigo:        string
    descripcion:   string
    cantidadPedida: number
    productoId?:   string
    stockTotal?:   number
    codigoBarra?:   string
    lpn?:           string
    tienda?:        string
    skuProveedor?:  string
    ok:             boolean
  }[]
}

export type ActivarSesionInput = {
  sesionId:  string
  usuarioId: string
}

export type TomarSubtareaInput = {
  subtareaId: string
  usuarioId:  string
}

export type ConfirmarSubtareaInput = {
  subtareaId:          string
  usuarioId:           string
  cantidadDespachada:  number
  motivo?:             string
  productoRealId?:     string  // si hubo equivalente
}

export type LiberarPropiasInput = {
  sesionId:  string
  usuarioId: string
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const pickingMasivoService = {

  // ── 1. Validar Excel (sin escribir nada) ──────────────────────────────────
  async validarExcel(input: ValidarExcelInput): Promise<ServiceResult<ValidarExcelResult>> {
    const codigos = input.items.map(i => i.codigo)

    // Buscar productos en catálogo
    const { data: productos, error } = await supabase
      .from('productos')
      .select('id, sku, nombre')
      .in('sku', codigos)

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const mapaCatalogo = new Map(productos?.map(p => [p.sku, p]) ?? [])

    // Buscar stock actual de los productos encontrados
    const productoIds = productos?.map(p => p.id) ?? []
    let mapaStock = new Map<string, number>()

    if (productoIds.length > 0) {
      const { data: lotes } = await supabase
        .from('lotes_inventario')
        .select('producto_id, cantidad')
        .in('producto_id', productoIds)
        .eq('activo', true)
        .gt('cantidad', 0)

      for (const l of lotes ?? []) {
        mapaStock.set(l.producto_id, (mapaStock.get(l.producto_id) ?? 0) + l.cantidad)
      }
    }

    const alertas: ValidarExcelResult['alertas'] = []
    const itemsResult: ValidarExcelResult['items'] = []
    let sinCatalogo = 0
    let sinStock = 0

    for (const item of input.items) {
      const prod = mapaCatalogo.get(item.codigo)
      if (!prod) {
        sinCatalogo++
        alertas.push({ codigo: item.codigo, descripcion: item.descripcion, tipo: 'sin_catalogo' })
        itemsResult.push({ ...item, codigoBarra: item.codigoBarra, lpn: item.lpn, ok: false })
        continue
      }

      const stock = mapaStock.get(prod.id) ?? 0
      if (stock === 0) {
        sinStock++
        alertas.push({
          codigo: item.codigo,
          descripcion: item.descripcion,
          tipo: 'sin_stock',
          stockActual: 0,
          solicitado: item.cantidadPedida,
        })
      } else if (stock < item.cantidadPedida) {
        alertas.push({
          codigo: item.codigo,
          descripcion: item.descripcion,
          tipo: 'stock_insuficiente',
          stockActual: stock,
          solicitado: item.cantidadPedida,
        })
      }

      itemsResult.push({
        ...item,
        productoId:  prod.id,
        stockTotal:  stock,
        codigoBarra: item.codigoBarra,
        lpn:         item.lpn,
        ok:          stock >= item.cantidadPedida,
      })
    }

    return {
      ok: true,
      data: {
        totalItems: input.items.length,
        conCatalogo: input.items.length - sinCatalogo,
        sinCatalogo,
        sinStock,
        alertas,
        items: itemsResult,
      },
    }
  },

  // ── 2. Crear sesión (estado: validando) ───────────────────────────────────
  async crearSesion(input: CrearSesionInput): Promise<ServiceResult<{ sesionId: string }>> {
    const { data: sesion, error: sesionErr } = await supabase
      .from('sesiones_picking_masivo')
      .insert({
        numero_oc:        input.numeroOc,
        nombre_cliente:   input.nombreCliente ?? null,
        numero_oc_pedido: input.numeroOcPedido ?? null,
        archivo_nombre:   input.archivoNombre,
        total_items:      input.items.length,
        creado_por:       input.usuarioId,
        estado:           'validando',
      })
      .select('id')
      .single()

    if (sesionErr || !sesion) {
      return { ok: false, error: { code: 'DB_ERROR', message: sesionErr?.message ?? 'Error al crear sesión' } }
    }

    const itemRows = input.items.map(item => ({
      sesion_id:          sesion.id,
      producto_id:        item.productoId ?? null,
      codigo:             item.codigo,
      descripcion:        item.descripcion,
      cantidad_pedida:    item.cantidadPedida,
      codigo_barra:       item.codigoBarra ?? null,
      lpn:                item.lpn ?? null,
      tienda:             item.tienda ?? null,
      sku_proveedor:      item.skuProveedor ?? null,
    }))

    const { error: itemsErr } = await supabase
      .from('items_picking_masivo')
      .insert(itemRows)

    if (itemsErr) {
      // Rollback sesión (best-effort)
      await supabase.from('sesiones_picking_masivo').delete().eq('id', sesion.id)
      return { ok: false, error: { code: 'DB_ERROR', message: itemsErr.message } }
    }

    return { ok: true, data: { sesionId: sesion.id } }
  },

  // ── 3. Activar sesión + generar subtareas FIFO ───────────────────────────
  async activarSesion(input: ActivarSesionInput): Promise<ServiceResult<{ subtareasGeneradas: number }>> {
    // Verificar sesión en estado validando
    const { data: sesion, error: sesErr } = await supabase
      .from('sesiones_picking_masivo')
      .select('id, estado, total_items')
      .eq('id', input.sesionId)
      .single()

    if (sesErr || !sesion) return { ok: false, error: { code: 'NOT_FOUND', message: 'Sesión no encontrada' } }
    if (sesion.estado !== 'validando') {
      return { ok: false, error: { code: 'INVALID_STATE', message: `La sesión está en estado '${sesion.estado}'` } }
    }

    // Obtener TODOS los ítems (incluyendo los sin producto_id, ej. Sodimac sin catálogo)
    const { data: items, error: itemsErr } = await supabase
      .from('items_picking_masivo')
      .select('id, producto_id, cantidad_pedida')
      .eq('sesion_id', input.sesionId)

    if (itemsErr) return { ok: false, error: { code: 'DB_ERROR', message: itemsErr.message } }

    const subtareas: {
      item_id:           string
      sesion_id:         string
      lote_id:           string
      posicion_id:       string
      posicion_codigo:   string
      orden_fifo:        number
      cantidad_asignada: number
    }[] = []

    const todosItems   = items ?? []
    const itemsConProd = todosItems.filter((i) => !!i.producto_id)
    const itemsSinProd = todosItems.filter((i) => !i.producto_id)
    const productoIds  = itemsConProd.map((i) => i.producto_id as string)

    // Una sola query para todos los lotes de todos los productos (M2).
    const { data: todosLotes } = productoIds.length
      ? await supabase
          .from('lotes_inventario')
          .select('id, producto_id, cantidad, posicion_id, creado_en, posiciones_rack(id, codigo)')
          .in('producto_id', productoIds)
          .eq('activo', true)
          .eq('en_pasillo', false)
          .gt('cantidad', 0)
          .order('creado_en', { ascending: true })
      : { data: [] }

    type LoteRaw = { id: string; producto_id: string; cantidad: number; posicion_id: string | null; creado_en: string; posiciones_rack: { id: string; codigo: string } | null }

    const lotesPorProducto = new Map<string, LoteRaw[]>()
    for (const lote of (todosLotes as LoteRaw[]) ?? []) {
      const arr = lotesPorProducto.get(lote.producto_id) ?? []
      arr.push(lote)
      lotesPorProducto.set(lote.producto_id, arr)
    }

    // Ítems con producto_id: asignar lotes FIFO o subtarea genérica si sin stock
    for (const item of itemsConProd) {
      const lotes   = lotesPorProducto.get(item.producto_id as string) ?? []
      let restante  = item.cantidad_pedida
      let orden     = 1
      let generadas = 0

      for (const lote of lotes) {
        if (restante <= 0) break
        const pos = lote.posiciones_rack as { id: string; codigo: string } | null
        if (!pos) continue
        const asignado = Math.min(lote.cantidad, restante)
        subtareas.push({
          item_id:           item.id,
          sesion_id:         input.sesionId,
          lote_id:           lote.id,
          posicion_id:       pos.id,
          posicion_codigo:   pos.codigo,
          orden_fifo:        orden++,
          cantidad_asignada: asignado,
        })
        restante -= asignado
        generadas++
      }

      if (generadas === 0) {
        subtareas.push({
          item_id:           item.id,
          sesion_id:         input.sesionId,
          lote_id:           null,
          posicion_id:       null,
          posicion_codigo:   '—',
          orden_fifo:        1,
          cantidad_asignada: item.cantidad_pedida,
        })
      }
    }

    // Ítems sin producto_id (no están en catálogo): subtarea genérica siempre
    for (const item of itemsSinProd) {
      subtareas.push({
        item_id:           item.id,
        sesion_id:         input.sesionId,
        lote_id:           null,
        posicion_id:       null,
        posicion_codigo:   '—',
        orden_fifo:        1,
        cantidad_asignada: item.cantidad_pedida,
      })
    }

    if (subtareas.length > 0) {
      const { error: subErr } = await supabase
        .from('subtareas_picking_masivo')
        .insert(subtareas)

      if (subErr) return { ok: false, error: { code: 'DB_ERROR', message: subErr.message } }
    }

    // Marcar sesión como activa
    const { error: updErr } = await supabase
      .from('sesiones_picking_masivo')
      .update({ estado: 'en_proceso', activada_en: new Date().toISOString() })
      .eq('id', input.sesionId)

    if (updErr) return { ok: false, error: { code: 'DB_ERROR', message: updErr.message } }

    return { ok: true, data: { subtareasGeneradas: subtareas.length } }
  },

  // ── 3b. Parchar sku_proveedor en items existentes ────────────────────────
  async parcharSkuProveedor(
    sesionId: string,
    items: { codigo: string; skuProveedor: string }[]
  ): Promise<ServiceResult<{ actualizados: number }>> {
    let actualizados = 0
    for (const item of items) {
      const { error } = await supabase
        .from('items_picking_masivo')
        .update({ sku_proveedor: item.skuProveedor })
        .eq('sesion_id', sesionId)
        .eq('codigo', item.codigo)
      if (!error) actualizados++
    }
    return { ok: true, data: { actualizados } }
  },

  // ── 4. Listar sesiones ────────────────────────────────────────────────────
  async listarSesiones(estado?: string): Promise<ServiceResult<unknown[]>> {
    let q = supabase
      .from('sesiones_picking_masivo')
      .select('id, numero_oc, nombre_cliente, numero_oc_pedido, estado, total_items, items_completados, archivo_nombre, creado_en, activada_en, completada_en, creado_por, despachado_en, despachado_por, nombre_chofer')
      .order('creado_en', { ascending: false })

    if (estado) q = q.eq('estado', estado)

    const { data, error } = await q
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const sesiones = data ?? []

    // Resolver nombres de usuario en paralelo
    const userIds = [...new Set(
      sesiones.flatMap((s: any) => [s.creado_por, s.despachado_por].filter(Boolean))
    )] as string[]

    let nombresMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .in('id', userIds)
      if (usuarios) {
        for (const u of usuarios) nombresMap[u.id] = u.nombre
      }
    }

    const result = sesiones.map((s: any) => ({
      ...s,
      creado_por_usuario:     s.creado_por    ? { nombre: nombresMap[s.creado_por]    ?? null } : null,
      despachado_por_usuario: s.despachado_por ? { nombre: nombresMap[s.despachado_por] ?? null } : null,
    }))

    return { ok: true, data: result }
  },

  // ── 5. Obtener sesión con ítems y subtareas ───────────────────────────────
  async obtenerSesion(sesionId: string): Promise<ServiceResult<unknown>> {
    const { data: sesion, error: sesErr } = await supabase
      .from('sesiones_picking_masivo')
      .select('*')
      .eq('id', sesionId)
      .single()

    if (sesErr || !sesion) return { ok: false, error: { code: 'NOT_FOUND', message: 'Sesión no encontrada' } }

    const { data: items, error: itemsErr } = await supabase
      .from('items_picking_masivo')
      .select(`
        *,
        subtareas_picking_masivo (
          id, posicion_codigo, orden_fifo, cantidad_asignada, cantidad_despachada,
          estado, bloqueado_por, bloqueado_en, completado_por, completado_en,
          motivo_diferencia, es_equivalente, producto_real_id
        )
      `)
      .eq('sesion_id', sesionId)
      .order('id')

    if (itemsErr) return { ok: false, error: { code: 'DB_ERROR', message: itemsErr.message } }

    // Resolver productos equivalentes en consulta separada
    const productosRealIds = [
      ...new Set(
        (items ?? [])
          .flatMap(i => i.subtareas_picking_masivo ?? [])
          .filter((s: any) => s.es_equivalente && s.producto_real_id)
          .map((s: any) => s.producto_real_id as string)
      )
    ]

    let productosEquivalentesMap: Record<string, { codigo: string; descripcion: string }> = {}
    if (productosRealIds.length > 0) {
      const { data: prods } = await supabase
        .from('productos')
        .select('id, codigo, descripcion')
        .in('id', productosRealIds)
      for (const p of prods ?? []) {
        productosEquivalentesMap[p.id] = { codigo: p.codigo, descripcion: p.descripcion }
      }
    }

    // Resolver nombres de operadores (bloqueado_por / completado_por)
    const operadorIds = [...new Set(
      (items ?? [])
        .flatMap((i: any) => i.subtareas_picking_masivo ?? [])
        .flatMap((s: any) => [s.bloqueado_por, s.completado_por].filter(Boolean))
    )] as string[]

    let operadoresMap: Record<string, string> = {}
    if (operadorIds.length > 0) {
      const { data: ops } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .in('id', operadorIds)
      for (const u of ops ?? []) operadoresMap[u.id] = u.nombre
    }

    const itemsConEquivalentes = (items ?? []).map((item: any) => ({
      ...item,
      subtareas_picking_masivo: (item.subtareas_picking_masivo ?? []).map((s: any) => ({
        ...s,
        producto_equivalente: s.es_equivalente && s.producto_real_id
          ? (productosEquivalentesMap[s.producto_real_id] ?? null)
          : null,
        bloqueado_por_nombre:  s.bloqueado_por  ? (operadoresMap[s.bloqueado_por]  ?? null) : null,
        completado_por_nombre: s.completado_por ? (operadoresMap[s.completado_por] ?? null) : null,
      })),
    }))

    // Cargar LPNs guardados en la tabla sesion_lpns
    const { data: lpnsRow } = await supabase
      .from('sesion_lpns')
      .select('lpns_data, lpns_escaneados')
      .eq('sesion_id', sesionId)
      .single()

    return { ok: true, data: { ...sesion, items: itemsConEquivalentes, lpns_excel: lpnsRow?.lpns_data ?? [], lpns_escaneados: lpnsRow?.lpns_escaneados ?? [] } }
  },

  // ── 6. Cola de subtareas libres para un operador ──────────────────────────
  async colaSubtareas(sesionId: string, _usuarioId: string): Promise<ServiceResult<unknown[]>> {
    // Liberar expiradas primero
    await supabase.rpc('liberar_subtareas_expiradas', { p_sesion_id: sesionId })

    const { data, error } = await supabase
      .from('subtareas_picking_masivo')
      .select(`
        id, posicion_codigo, orden_fifo, cantidad_asignada, cantidad_despachada,
        estado, bloqueado_por, bloqueado_en, motivo_diferencia,
        item_id,
        items_picking_masivo ( codigo, descripcion, cantidad_pedida, cantidad_despachada, codigo_barra, lpn, producto_id )
      `)
      .eq('sesion_id', sesionId)
      .in('estado', ['libre', 'bloqueado', 'parcial', 'sin_stock', 'completado'])
      .order('orden_fifo', { ascending: true })

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: data ?? [] }
  },

  // ── 7. Tomar subtarea (bloqueo) ───────────────────────────────────────────
  async tomarSubtarea(input: TomarSubtareaInput): Promise<ServiceResult<{ subtareaId: string }>> {
    // Verificar que esté libre
    const { data: sub, error: subErr } = await supabase
      .from('subtareas_picking_masivo')
      .select('id, estado, bloqueado_en')
      .eq('id', input.subtareaId)
      .single()

    if (subErr || !sub) return { ok: false, error: { code: 'NOT_FOUND', message: 'Subtarea no encontrada' } }
    if (sub.estado !== 'libre') {
      return { ok: false, error: { code: 'CONFLICT', message: 'La subtarea ya fue tomada por otro operador' } }
    }

    // El SELECT previo es solo una comprobación rápida; la carrera real se resuelve aquí:
    // si otro operador ganó entre el SELECT y este UPDATE, la condición .eq('estado','libre')
    // no matchea ninguna fila y updated queda vacío → retornamos CONFLICT (H2).
    const { data: updated, error: updErr } = await supabase
      .from('subtareas_picking_masivo')
      .update({
        estado:        'bloqueado',
        bloqueado_por: input.usuarioId,
        bloqueado_en:  new Date().toISOString(),
      })
      .eq('id', input.subtareaId)
      .eq('estado', 'libre')
      .select('id')

    if (updErr) return { ok: false, error: { code: 'DB_ERROR', message: updErr.message } }
    if (!updated || updated.length === 0) {
      return { ok: false, error: { code: 'CONFLICT', message: 'La subtarea ya fue tomada por otro operador' } }
    }

    return { ok: true, data: { subtareaId: input.subtareaId } }
  },

  // ── 8. Confirmar subtarea ─────────────────────────────────────────────────
  async confirmarSubtarea(input: ConfirmarSubtareaInput): Promise<ServiceResult<{ movimientoId: string | null }>> {
    // Verificar que esté bloqueada por este usuario
    const { data: sub, error: subErr } = await supabase
      .from('subtareas_picking_masivo')
      .select('id, estado, bloqueado_por, sesion_id, lote_id, cantidad_asignada, item_id, items_picking_masivo(producto_id)')
      .eq('id', input.subtareaId)
      .single()

    if (subErr || !sub) return { ok: false, error: { code: 'NOT_FOUND', message: 'Subtarea no encontrada' } }
    if (sub.estado !== 'bloqueado') {
      return { ok: false, error: { code: 'INVALID_STATE', message: 'La subtarea no está bloqueada' } }
    }
    if (sub.bloqueado_por !== input.usuarioId) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'No tienes esta subtarea bloqueada' } }
    }

    const cantidadDespachada = input.cantidadDespachada
    const esParcialoSinStock = cantidadDespachada < sub.cantidad_asignada
    const esEquivalente = !!input.productoRealId
    const productoRealId = input.productoRealId ?? (sub.items_picking_masivo as { producto_id: string } | null)?.producto_id

    if (esParcialoSinStock && !input.motivo) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'El motivo es obligatorio para despacho parcial o sin stock' } }
    }

    let movimientoId: string | null = null

    // Registrar movimiento de salida solo si se despachó algo
    if (cantidadDespachada > 0 && productoRealId) {
      // Decremento atómico: la resta ocurre en la BD para evitar race condition (H3).
      if (sub.lote_id) {
        const { data: descontarResult, error: errorLote } = await supabase
          .rpc('descontar_lote', { p_lote_id: sub.lote_id, p_cantidad: cantidadDespachada })
        if (errorLote) return { ok: false, error: { code: 'DB_ERROR', message: errorLote.message } }
        if (!descontarResult?.ok) {
          return { ok: false, error: { code: 'STOCK_INSUFICIENTE', message: 'Stock insuficiente al momento de confirmar. Intenta nuevamente.' } }
        }
      }

      // Registrar en movimientos
      const { data: mov, error: movErr } = await supabase
        .from('movimientos')
        .insert({
          tipo:           'salida',
          producto_id:    productoRealId,
          lote_id:        sub.lote_id,
          cantidad:       cantidadDespachada,
          usuario_id:     input.usuarioId,
          detalle:        { sesion_id: sub.sesion_id, motivo: input.motivo ?? null },
        })
        .select('id')
        .single()

      if (movErr) return { ok: false, error: { code: 'DB_ERROR', message: movErr.message } }
      movimientoId = mov?.id ?? null
    }

    // Actualizar subtarea (dispara trigger sync_item_desde_subtarea)
    const estadoFinal = cantidadDespachada === 0
      ? 'sin_stock'
      : cantidadDespachada >= sub.cantidad_asignada
        ? 'completado'
        : 'parcial'

    const { error: updErr } = await supabase
      .from('subtareas_picking_masivo')
      .update({
        estado:               estadoFinal,
        completado_por:       input.usuarioId,
        completado_en:        new Date().toISOString(),
        cantidad_despachada:  cantidadDespachada,
        motivo_diferencia:    input.motivo ?? null,
        producto_real_id:     productoRealId ?? null,
        es_equivalente:       esEquivalente,
        movimiento_id:        movimientoId,
      })
      .eq('id', input.subtareaId)

    if (updErr) return { ok: false, error: { code: 'DB_ERROR', message: updErr.message } }

    return { ok: true, data: { movimientoId } }
  },

  // ── 9. Editar subtarea parcial ────────────────────────────────────────────
  async editarParcial(input: EditarParcialInput): Promise<ServiceResult<{ subtareaId: string }>> {
    const { data: sub, error: subErr } = await supabase
      .from('subtareas_picking_masivo')
      .select('id, estado, bloqueado_por')
      .eq('id', input.subtareaId)
      .single()

    if (subErr || !sub) return { ok: false, error: { code: 'NOT_FOUND', message: 'Subtarea no encontrada' } }
    if (sub.estado !== 'parcial' && sub.estado !== 'sin_stock') {
      return { ok: false, error: { code: 'INVALID_STATE', message: 'Solo se pueden editar subtareas en estado parcial o sin stock' } }
    }

    const estadoFinal = input.cantidadDespachada === 0
      ? 'sin_stock'
      : 'parcial'

    const { error } = await supabase
      .from('subtareas_picking_masivo')
      .update({
        cantidad_despachada: input.cantidadDespachada,
        motivo_diferencia:   input.motivo ?? null,
        estado:              estadoFinal,
        completado_por:      input.usuarioId,
        completado_en:       new Date().toISOString(),
      })
      .eq('id', input.subtareaId)

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: { subtareaId: input.subtareaId } }
  },

  // ── 11. Liberar propias subtareas bloqueadas ─────────────────────────────
  async liberarPropias(input: LiberarPropiasInput): Promise<ServiceResult<{ liberadas: number }>> {
    const { data, error } = await supabase
      .from('subtareas_picking_masivo')
      .update({
        estado:        'libre',
        bloqueado_por: null,
        bloqueado_en:  null,
      })
      .eq('sesion_id', input.sesionId)
      .eq('bloqueado_por', input.usuarioId)
      .eq('estado', 'bloqueado')
      .select('id')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: { liberadas: data?.length ?? 0 } }
  },

  // ── 12. Cancelar sesión ──────────────────────────────────────────────────
  async cancelarSesion(sesionId: string): Promise<ServiceResult<{ sesionId: string }>> {
    const { data: sesion } = await supabase
      .from('sesiones_picking_masivo')
      .select('estado')
      .eq('id', sesionId)
      .single()

    if (!sesion) return { ok: false, error: { code: 'NOT_FOUND', message: 'Sesión no encontrada' } }
    if (sesion.estado === 'completada') {
      return { ok: false, error: { code: 'INVALID_STATE', message: 'No se puede cancelar una sesión completada' } }
    }

    // Liberar todas las subtareas bloqueadas de la sesión
    await supabase
      .from('subtareas_picking_masivo')
      .update({ estado: 'libre', bloqueado_por: null, bloqueado_en: null })
      .eq('sesion_id', sesionId)
      .eq('estado', 'bloqueado')

    const { error } = await supabase
      .from('sesiones_picking_masivo')
      .update({ estado: 'cancelada' })
      .eq('id', sesionId)

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: { sesionId } }
  },

  // ── 13. Validar LPN (admin — etapa de despacho) ──────────────────────────
  async buscarLpn(sesionId: string, lpn: string): Promise<ServiceResult<{
    itemId:         string
    codigo:         string
    descripcion:    string
    cantidadPedida: number
    tienda:         string | null
  }>> {
    const { data: item, error } = await supabase
      .from('items_picking_masivo')
      .select('id, codigo, descripcion, cantidad_pedida, tienda')
      .eq('sesion_id', sesionId)
      .eq('lpn', lpn)
      .single()

    if (error || !item) return { ok: false, error: { code: 'NOT_FOUND', message: 'LPN no encontrado en esta sesión' } }

    return {
      ok: true,
      data: {
        itemId:         item.id,
        codigo:         item.codigo,
        descripcion:    item.descripcion,
        cantidadPedida: item.cantidad_pedida,
        tienda:         item.tienda ?? null,
      },
    }
  },

  async validarLpn(sesionId: string, lpn: string): Promise<ServiceResult<{
    itemId:         string
    codigo:         string
    descripcion:    string
    cantidadPedida: number
    tienda:         string | null
    lpnValidado:    boolean
  }>> {
    const { data: item, error } = await supabase
      .from('items_picking_masivo')
      .select('id, codigo, descripcion, cantidad_pedida, tienda, lpn_validado')
      .eq('sesion_id', sesionId)
      .eq('lpn', lpn)
      .single()

    if (error || !item) return { ok: false, error: { code: 'NOT_FOUND', message: 'LPN no encontrado en esta sesión' } }

    if (!item.lpn_validado) {
      await supabase
        .from('items_picking_masivo')
        .update({ lpn_validado: true, lpn_validado_en: new Date().toISOString() })
        .eq('id', item.id)
    }

    return {
      ok: true,
      data: {
        itemId:         item.id,
        codigo:         item.codigo,
        descripcion:    item.descripcion,
        cantidadPedida: item.cantidad_pedida,
        tienda:         item.tienda ?? null,
        lpnValidado:    true,
      },
    }
  },

  // ── 14b. Buscar ítem por código de barras (flujo sin LPN — Sodimac) ──────
  async buscarItem(sesionId: string, termino: string): Promise<ServiceResult<{
    itemId:              string
    codigo:              string
    descripcion:         string
    cantidadPedida:      number
    cantidadDespachada:  number
    tienda:              string | null
  }>> {
    const SELECT = `id, codigo, descripcion, tienda, cantidad_pedida,
      subtareas_picking_masivo ( cantidad_despachada, estado ),
      producto_id`

    // 1. Buscar por codigo_barra del Excel en items_picking_masivo
    let { data: items } = await supabase
      .from('items_picking_masivo')
      .select(SELECT)
      .eq('sesion_id', sesionId)
      .eq('codigo_barra', termino)
      .limit(1)

    // 2. Buscar por codigo_barra del catálogo: primero resolver producto_id, luego buscar directo
    if (!items || items.length === 0) {
      const { data: prod } = await supabase
        .from('productos')
        .select('id')
        .eq('codigo_barra', termino)
        .limit(1)
        .single()

      if (prod?.id) {
        const r2 = await supabase
          .from('items_picking_masivo')
          .select(SELECT)
          .eq('sesion_id', sesionId)
          .eq('producto_id', prod.id)
          .limit(1)
        items = r2.data
      }
    }

    // 2b. Buscar por codigo_barra_alternativo del catálogo
    if (!items || items.length === 0) {
      const { data: prodAlt } = await supabase
        .from('productos')
        .select('id')
        .eq('codigo_barra_alternativo', termino)
        .limit(1)
        .single()

      if (prodAlt?.id) {
        const r2b = await supabase
          .from('items_picking_masivo')
          .select(SELECT)
          .eq('sesion_id', sesionId)
          .eq('producto_id', prodAlt.id)
          .limit(1)
        items = r2b.data
      }
    }

    // 3. Fallback: buscar por código exacto del item
    if (!items || items.length === 0) {
      const r3 = await supabase
        .from('items_picking_masivo')
        .select(SELECT)
        .eq('sesion_id', sesionId)
        .eq('codigo', termino)
        .limit(1)
      items = r3.data
    }

    if (!items || items.length === 0) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Producto no encontrado en esta sesión' } }
    }

    const item = items[0] as any
    const cantidadDespachada = (item.subtareas_picking_masivo as any[])
      .reduce((sum: number, s: any) => sum + (s.cantidad_despachada ?? 0), 0)

    return {
      ok: true,
      data: {
        itemId:             item.id,
        codigo:             item.codigo,
        descripcion:        item.descripcion,
        cantidadPedida:     item.cantidad_pedida,
        cantidadDespachada,
        tienda:             item.tienda ?? null,
      },
    }
  },

  // ── 14c. Validar ítem por id (flujo sin LPN — Sodimac) ───────────────────
  async guardarLpns(sesionId: string, lpnsData: unknown[]): Promise<ServiceResult<{ ok: boolean }>> {
    await supabase.from('sesion_lpns').delete().eq('sesion_id', sesionId)
    const { error } = await supabase
      .from('sesion_lpns')
      .insert({ sesion_id: sesionId, lpns_data: lpnsData, lpns_escaneados: [] })
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: { ok: true } }
  },

  async guardarLpnsEscaneados(sesionId: string, lpnsEscaneados: string[]): Promise<ServiceResult<{ ok: boolean }>> {
    const { error } = await supabase
      .from('sesion_lpns')
      .update({ lpns_escaneados: lpnsEscaneados })
      .eq('sesion_id', sesionId)
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: { ok: true } }
  },

  async validarItem(sesionId: string, itemId: string): Promise<ServiceResult<{ ok: boolean }>> {
    const { error } = await supabase
      .from('items_picking_masivo')
      .update({ lpn_validado: true, lpn_validado_en: new Date().toISOString() })
      .eq('id', itemId)
      .eq('sesion_id', sesionId)

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: { ok: true } }
  },

  // ── 14. Despachar sesión (admin) ─────────────────────────────────────────
  async despacharSesion(input: { sesionId: string; usuarioId: string; nombreChofer: string }): Promise<ServiceResult<{ sesionId: string }>> {
    const { data: sesion } = await supabase
      .from('sesiones_picking_masivo')
      .select('estado')
      .eq('id', input.sesionId)
      .single()

    if (!sesion) return { ok: false, error: { code: 'NOT_FOUND', message: 'Sesión no encontrada' } }
    if (sesion.estado !== 'completada') {
      return { ok: false, error: { code: 'INVALID_STATE', message: 'La sesión debe estar completada para despachar' } }
    }

    if (!input.nombreChofer.trim()) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'El nombre del chofer es obligatorio' } }
    }

    // Verificar que todos los ítems con LPN estén validados
    const { data: items } = await supabase
      .from('items_picking_masivo')
      .select('id, lpn, lpn_validado')
      .eq('sesion_id', input.sesionId)
      .not('lpn', 'is', null)

    const pendientes = (items ?? []).filter(i => !i.lpn_validado)
    if (pendientes.length > 0) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: `Faltan ${pendientes.length} LPN(s) por validar` } }
    }

    const { error } = await supabase
      .from('sesiones_picking_masivo')
      .update({
        estado:        'despachado',
        nombre_chofer:  input.nombreChofer.trim(),
        despachado_en:  new Date().toISOString(),
        despachado_por: input.usuarioId,
      })
      .eq('id', input.sesionId)

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: { sesionId: input.sesionId } }
  },
}
