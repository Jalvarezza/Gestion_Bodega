// @ts-nocheck
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export type ProveedorOla = 'imperial' | 'construmart'

export type LineaOlaInput = {
  lpn:               string
  posicionOrden:     number
  codigoBarra:       string
  codigoProveedor:   string
  skuProveedor:      string
  tienda:            string
  cantidadSolicitada: number
}

export type OrdenOlaInput = {
  numeroOrden: string
  numeroGuia:  string
  lineas:      LineaOlaInput[]
}

export type CrearOlaInput = {
  proveedor:      ProveedorOla
  archivoNombre:  string
  fechaEntrega?:  string
  usuarioId:      string
  ordenes:        OrdenOlaInput[]
}

// ─── Tipos de resultado ───────────────────────────────────────────────────────

export type AlertaOla = {
  codigoBarra:    string
  skuProveedor:   string
  tipo:           'sin_catalogo' | 'sin_stock' | 'stock_insuficiente'
  stockActual?:   number
  solicitado?:    number
}

export type SkuValidadoOla = {
  codigoBarra:    string
  skuProveedor:   string
  codigoProveedor: string
  productoId?:    string
  nombre?:        string
  stockTotal?:    number
  cantidadTotal:  number
  nLineas:        number
  ok:             boolean
}

export type ValidarArchivoResult = {
  totalLineas:    number
  skusUnicos:     number
  conCatalogo:    number
  sinCatalogo:    number
  sinStock:       number
  alertas:        AlertaOla[]
  skus:           SkuValidadoOla[]
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const olasService = {

  // ── 1. Validar archivo (solo lectura — no escribe nada) ───────────────────
  // Recibe el consolidado de SKUs únicos con sus cantidades totales.
  // Cruza por codigo_barra (EAN13) y, como fallback, por sku (Cod. Proveedor).
  async validarArchivo(
    skus: { codigoBarra: string; skuProveedor: string; codigoProveedor: string; cantidadTotal: number; nLineas: number }[]
  ): Promise<ServiceResult<ValidarArchivoResult>> {

    const codigosBarras = skus.map(s => s.codigoBarra).filter(Boolean)
    const skusProvs     = skus.map(s => s.skuProveedor).filter(Boolean)

    // Buscar por codigo_barra primero
    const { data: prodsBarra, error: errBarra } = await supabase
      .from('productos')
      .select('id, sku, nombre, codigo_barra')
      .in('codigo_barra', codigosBarras)

    if (errBarra) return { ok: false, error: { code: 'DB_ERROR', message: errBarra.message } }

    // Fallback: buscar por sku (Cod. Proveedor) para los que no matchearon por barra
    const yaEncontradosBarras = new Set((prodsBarra ?? []).map(p => p.codigo_barra))
    const skusProvFaltantes = skus
      .filter(s => !yaEncontradosBarras.has(s.codigoBarra) && s.skuProveedor)
      .map(s => s.skuProveedor)

    let prodsSku: any[] = []
    if (skusProvFaltantes.length > 0) {
      const { data } = await supabase
        .from('productos')
        .select('id, sku, nombre, codigo_barra')
        .in('sku', skusProvFaltantes)
      prodsSku = data ?? []
    }

    // Construir mapa: codigoBarra → producto
    const mapaProd = new Map<string, { id: string; sku: string; nombre: string }>()
    for (const p of prodsBarra ?? []) {
      if (p.codigo_barra) mapaProd.set(p.codigo_barra, p)
    }
    // Para los fallback por sku: mapear usando el skuProveedor del input
    for (const s of skus) {
      if (!mapaProd.has(s.codigoBarra) && s.skuProveedor) {
        const pSku = prodsSku.find(p => p.sku === s.skuProveedor)
        if (pSku) mapaProd.set(s.codigoBarra, pSku)
      }
    }

    // Consultar stock de los productos encontrados
    const productoIds = [...new Set([...mapaProd.values()].map(p => p.id))]
    const mapaStock   = new Map<string, number>()

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

    // Construir resultado
    const alertas: AlertaOla[]     = []
    const skusResult: SkuValidadoOla[] = []
    let sinCatalogo = 0
    let sinStock    = 0

    for (const s of skus) {
      const prod = mapaProd.get(s.codigoBarra)

      if (!prod) {
        sinCatalogo++
        alertas.push({ codigoBarra: s.codigoBarra, skuProveedor: s.skuProveedor, tipo: 'sin_catalogo' })
        skusResult.push({ ...s, ok: false })
        continue
      }

      const stock = mapaStock.get(prod.id) ?? 0
      if (stock === 0) {
        sinStock++
        alertas.push({ codigoBarra: s.codigoBarra, skuProveedor: s.skuProveedor, tipo: 'sin_stock', stockActual: 0, solicitado: s.cantidadTotal })
      } else if (stock < s.cantidadTotal) {
        alertas.push({ codigoBarra: s.codigoBarra, skuProveedor: s.skuProveedor, tipo: 'stock_insuficiente', stockActual: stock, solicitado: s.cantidadTotal })
      }

      skusResult.push({
        ...s,
        productoId: prod.id,
        nombre:     prod.nombre,
        stockTotal: stock,
        ok:         stock >= s.cantidadTotal,
      })
    }

    return {
      ok: true,
      data: {
        totalLineas:  skus.reduce((s, k) => s + k.nLineas, 0),
        skusUnicos:   skus.length,
        conCatalogo:  skus.length - sinCatalogo,
        sinCatalogo,
        sinStock,
        alertas,
        skus: skusResult,
      },
    }
  },

  // ── 2. Crear ola (estado: validando) ─────────────────────────────────────
  async crearOla(input: CrearOlaInput): Promise<ServiceResult<{ olaId: string }>> {
    const totalLineas = input.ordenes.reduce((sum, o) => sum + o.lineas.length, 0)

    // Resolver producto_id por codigo_barra para cada línea
    const codigosBarras = [...new Set(
      input.ordenes.flatMap(o => o.lineas.map(l => l.codigoBarra)).filter(Boolean)
    )]
    const skusProvs = [...new Set(
      input.ordenes.flatMap(o => o.lineas.map(l => l.skuProveedor)).filter(Boolean)
    )]

    const { data: prodsBarra } = await supabase
      .from('productos')
      .select('id, codigo_barra, sku')
      .in('codigo_barra', codigosBarras)

    const yaEncontradosBarras = new Set((prodsBarra ?? []).map(p => p.codigo_barra))
    const skusFaltantes = input.ordenes
      .flatMap(o => o.lineas)
      .filter(l => !yaEncontradosBarras.has(l.codigoBarra) && l.skuProveedor)
      .map(l => l.skuProveedor)

    let prodsSku: any[] = []
    if (skusFaltantes.length > 0) {
      const { data } = await supabase
        .from('productos')
        .select('id, codigo_barra, sku')
        .in('sku', [...new Set(skusFaltantes)])
      prodsSku = data ?? []
    }

    // Mapa codigoBarra → productoId
    const mapaProdId = new Map<string, string>()
    for (const p of prodsBarra ?? []) {
      if (p.codigo_barra) mapaProdId.set(p.codigo_barra, p.id)
    }
    for (const o of input.ordenes) {
      for (const l of o.lineas) {
        if (!mapaProdId.has(l.codigoBarra) && l.skuProveedor) {
          const pSku = prodsSku.find(p => p.sku === l.skuProveedor)
          if (pSku) mapaProdId.set(l.codigoBarra, pSku.id)
        }
      }
    }

    // Insertar cabecera de la ola
    const totalOrdenes = new Set(input.ordenes.map(o => o.numeroOrden)).size

    const { data: ola, error: olaErr } = await supabase
      .from('olas_picking')
      .insert({
        proveedor:      input.proveedor,
        archivo_nombre: input.archivoNombre,
        fecha_entrega:  input.fechaEntrega || null,
        estado:         'validando',
        total_ordenes:  totalOrdenes,
        total_lineas:   totalLineas,
        creado_por:     input.usuarioId,
      })
      .select('id')
      .single()

    if (olaErr || !ola) {
      return { ok: false, error: { code: 'DB_ERROR', message: olaErr?.message ?? 'Error al crear ola' } }
    }

    const olaId = ola.id

    // Insertar órdenes y líneas
    for (const orden of input.ordenes) {
      const { data: ordenRow, error: ordenErr } = await supabase
        .from('ola_ordenes')
        .insert({
          ola_id:        olaId,
          numero_orden:  orden.numeroOrden,
          numero_guia:   orden.numeroGuia || null,
          nombre_tienda: null,
        })
        .select('id')
        .single()

      if (ordenErr || !ordenRow) {
        await supabase.from('olas_picking').delete().eq('id', olaId)
        return { ok: false, error: { code: 'DB_ERROR', message: ordenErr?.message ?? 'Error al crear orden' } }
      }

      const lineaRows = orden.lineas.map(l => ({
        ola_id:              olaId,
        orden_id:            ordenRow.id,
        lpn:                 l.lpn,
        posicion_orden:      l.posicionOrden || null,
        codigo_barra:        l.codigoBarra || null,
        codigo_proveedor:    l.codigoProveedor || null,
        sku_proveedor:       l.skuProveedor || null,
        producto_id:         mapaProdId.get(l.codigoBarra) ?? null,
        descripcion:         l.skuProveedor || l.codigoProveedor || l.codigoBarra,
        tienda:              l.tienda || null,
        cantidad_solicitada: l.cantidadSolicitada,
      }))

      const { error: lineasErr } = await supabase.from('ola_lineas').insert(lineaRows)
      if (lineasErr) {
        await supabase.from('olas_picking').delete().eq('id', olaId)
        return { ok: false, error: { code: 'DB_ERROR', message: lineasErr.message } }
      }
    }

    return { ok: true, data: { olaId } }
  },

  // ── 3. Activar ola → generar tareas de extracción FIFO ───────────────────
  async activarOla(olaId: string, usuarioId: string): Promise<ServiceResult<{ tareasGeneradas: number }>> {
    const { data: ola, error: olaErr } = await supabase
      .from('olas_picking')
      .select('id, estado')
      .eq('id', olaId)
      .single()

    if (olaErr || !ola) return { ok: false, error: { code: 'NOT_FOUND', message: 'Ola no encontrada' } }
    if (ola.estado !== 'validando') {
      return { ok: false, error: { code: 'INVALID_STATE', message: `La ola está en estado '${ola.estado}'` } }
    }

    // Obtener todas las líneas con producto resuelto
    const { data: lineas, error: lineasErr } = await supabase
      .from('ola_lineas')
      .select('producto_id, codigo_barra, sku_proveedor, descripcion, cantidad_solicitada')
      .eq('ola_id', olaId)

    if (lineasErr) return { ok: false, error: { code: 'DB_ERROR', message: lineasErr.message } }

    // Consolidar por codigo_barra → cantidad total
    type SkuAgrupado = {
      productoId?:    string
      codigoBarra:    string
      descripcion:    string
      cantidadTotal:  number
    }
    const mapaSkus = new Map<string, SkuAgrupado>()

    for (const l of lineas ?? []) {
      const key = l.codigo_barra ?? l.sku_proveedor ?? l.descripcion
      if (!mapaSkus.has(key)) {
        mapaSkus.set(key, {
          productoId:   l.producto_id ?? undefined,
          codigoBarra:  l.codigo_barra ?? '',
          descripcion:  l.descripcion,
          cantidadTotal: 0,
        })
      }
      mapaSkus.get(key)!.cantidadTotal += l.cantidad_solicitada
    }

    // Para cada SKU con producto_id, calcular ruta FIFO
    const productoIds = [...mapaSkus.values()]
      .map(s => s.productoId)
      .filter(Boolean) as string[]

    type LoteRaw = {
      id: string
      producto_id: string
      cantidad: number
      creado_en: string
      posiciones_rack: { id: string; codigo: string } | null
    }

    let lotesPorProducto = new Map<string, LoteRaw[]>()

    if (productoIds.length > 0) {
      const { data: lotes } = await supabase
        .from('lotes_inventario')
        .select('id, producto_id, cantidad, creado_en, posiciones_rack(id, codigo)')
        .in('producto_id', productoIds)
        .eq('activo', true)
        .eq('en_pasillo', false)
        .gt('cantidad', 0)
        .order('creado_en', { ascending: true })

      for (const l of (lotes as LoteRaw[]) ?? []) {
        const arr = lotesPorProducto.get(l.producto_id) ?? []
        arr.push(l)
        lotesPorProducto.set(l.producto_id, arr)
      }
    }

    // Construir tareas de extracción
    const tareas: object[] = []

    for (const [, sku] of mapaSkus) {
      const lotes        = sku.productoId ? (lotesPorProducto.get(sku.productoId) ?? []) : []
      const rutaSugerida: { posicion_codigo: string; lote_id: string; cantidad: number }[] = []
      let restante = sku.cantidadTotal

      for (const lote of lotes) {
        if (restante <= 0) break
        const pos = lote.posiciones_rack
        if (!pos) continue
        const asignado = Math.min(lote.cantidad, restante)
        rutaSugerida.push({ posicion_codigo: pos.codigo, lote_id: lote.id, cantidad: asignado })
        restante -= asignado
      }

      tareas.push({
        ola_id:        olaId,
        producto_id:   sku.productoId ?? null,
        codigo_barra:  sku.codigoBarra || null,
        descripcion:   sku.descripcion,
        cantidad_total: sku.cantidadTotal,
        ruta_sugerida: rutaSugerida.length > 0 ? rutaSugerida : null,
        estado:        'libre',
      })
    }

    if (tareas.length > 0) {
      const { error: tareasErr } = await supabase.from('ola_tareas_extraccion').insert(tareas)
      if (tareasErr) return { ok: false, error: { code: 'DB_ERROR', message: tareasErr.message } }
    }

    const { error: updErr } = await supabase
      .from('olas_picking')
      .update({ estado: 'en_extraccion', activada_en: new Date().toISOString() })
      .eq('id', olaId)

    if (updErr) return { ok: false, error: { code: 'DB_ERROR', message: updErr.message } }

    return { ok: true, data: { tareasGeneradas: tareas.length } }
  },

  // ── 4. Listar olas ────────────────────────────────────────────────────────
  async listarOlas(estado?: string): Promise<ServiceResult<unknown[]>> {
    let q = supabase
      .from('olas_picking')
      .select('id, proveedor, archivo_nombre, fecha_entrega, estado, total_ordenes, total_lineas, creado_por, creado_en, activada_en, completada_en, despachado_en, nombre_chofer')
      .order('creado_en', { ascending: false })

    if (estado) q = q.eq('estado', estado)

    const { data, error } = await q
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const olas      = data ?? []
    const userIds   = [...new Set(olas.map((o: any) => o.creado_por).filter(Boolean))] as string[]
    let nombresMap: Record<string, string> = {}

    if (userIds.length > 0) {
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .in('id', userIds)
      for (const u of usuarios ?? []) nombresMap[u.id] = u.nombre
    }

    return {
      ok: true,
      data: olas.map((o: any) => ({
        ...o,
        creado_por_usuario: o.creado_por ? { nombre: nombresMap[o.creado_por] ?? null } : null,
      })),
    }
  },

  // ── 5. Obtener ola completa ───────────────────────────────────────────────
  async obtenerOla(olaId: string): Promise<ServiceResult<unknown>> {
    const { data: ola, error: olaErr } = await supabase
      .from('olas_picking')
      .select('*')
      .eq('id', olaId)
      .single()

    if (olaErr || !ola) return { ok: false, error: { code: 'NOT_FOUND', message: 'Ola no encontrada' } }

    const [{ data: ordenes }, { data: tareas }] = await Promise.all([
      supabase
        .from('ola_ordenes')
        .select(`id, numero_orden, numero_guia, nombre_tienda,
          ola_lineas ( id, lpn, posicion_orden, codigo_barra, codigo_proveedor,
            sku_proveedor, producto_id, descripcion, tienda, cantidad_solicitada,
            fase2_escaneado, fase2_en, fase3_validado, fase3_en )`)
        .eq('ola_id', olaId)
        .order('numero_orden'),
      supabase
        .from('ola_tareas_extraccion')
        .select('id, descripcion, codigo_barra, cantidad_total, cantidad_extraida, estado, ruta_sugerida, bloqueado_por, completado_en')
        .eq('ola_id', olaId)
        .order('descripcion'),
    ])

    return { ok: true, data: { ...ola, ordenes: ordenes ?? [], tareas: tareas ?? [] } }
  },

  // ── 6. Cancelar ola ───────────────────────────────────────────────────────
  async cancelarOla(olaId: string): Promise<ServiceResult<{ olaId: string }>> {
    const { data: ola } = await supabase
      .from('olas_picking')
      .select('estado')
      .eq('id', olaId)
      .single()

    if (!ola) return { ok: false, error: { code: 'NOT_FOUND', message: 'Ola no encontrada' } }
    if (ola.estado === 'despachada') {
      return { ok: false, error: { code: 'INVALID_STATE', message: 'No se puede cancelar una ola despachada' } }
    }

    await supabase
      .from('ola_tareas_extraccion')
      .update({ estado: 'libre', bloqueado_por: null, bloqueado_en: null })
      .eq('ola_id', olaId)
      .eq('estado', 'bloqueado')

    const { error } = await supabase
      .from('olas_picking')
      .update({ estado: 'cancelada' })
      .eq('id', olaId)

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: { olaId } }
  },
}
