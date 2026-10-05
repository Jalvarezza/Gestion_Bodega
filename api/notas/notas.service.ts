// @ts-nocheck
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'
import type { Database } from '../lib/supabase/types'

type NotaVenta    = Database['public']['Tables']['notas_venta']['Row']
type NotaProducto = Database['public']['Tables']['nota_productos']['Row']

// ── Tipos públicos ─────────────────────────────────────────────────────────

export type Ubicacion = {
  loteId:         string
  posicionCodigo: string | null
  cantidad:       number
  fechaIngreso:   string
}

export type ProductoConStock = {
  productoId:           string
  sku:                  string
  nombre:               string
  codigoBarra:          string
  codigoBaRalternativo?: string | null
  stockDisponible:      number
  ubicaciones:          Ubicacion[]
}

export type NotaProductoResumen = {
  notaProductoId:            string
  productoId:                string
  sku:                       string
  nombre:                    string
  codigoBarra:               string
  codigoBaRalternativo?:     string | null
  cantidadSolicitada:        number
  cantidadDespachada:    number
  estado:                string
  ubicaciones:           Ubicacion[]
  productoEquivalenteId: string | null
  skuEquivalente:        string | null
  comentarioOperador:    string | null
  revisadoAdmin:         boolean
  equivalentes:          ProductoConStock[]
}

export type CrearNotaInput = {
  adminId:              string
  numeroNota:           string
  nombreCliente:        string
  rutCliente:           string
  numeroOc?:            string
  archivoNombre?:       string
  comentarioDespacho?:  string
  productos: { productoId: string; cantidadSolicitada: number }[]
}

export type CrearNotaResult = {
  notaId:     string
  numeroNota: string
  estado:     'pendiente'
  productos:  NotaProductoResumen[]
}

export type NotaResumen = {
  notaId:             string
  numeroNota:         string
  nombreCliente:      string
  tipoDev:            'total' | 'parcial' | null
  estado:             string
  totalProductos:     number
  productosCompletos: number
  creadoEn:           string
  importadoPor:       string
  tomadaPor:          string | null
  completadaPor:      string | null
  tieneDev:           boolean
  fechaPreparacion:   string | null
  fechaDespacho:      string | null
}

export type DetalleNota = {
  notaId:              string
  numeroNota:          string
  nombreCliente:       string
  rutCliente:          string
  numeroOc:            string | null
  comentarioDespacho:  string | null
  estado:              string
  fechaPreparacion:    string | null
  fechaDespacho:       string | null
  productos:           NotaProductoResumen[]
  devolucion?:         { items: { sku: string; nombre: string; cantidad: number }[] } | null
}

export type RegistrarPickingInput = {
  usuarioId:              string
  notaProductoId:         string
  codigoProducto:         string
  cantidad:               number
  usarEquivalente?:       boolean
  productoEquivalenteId?: string
  comentarioOperador?:    string | null
  loteId?:                string   // multi-lote: lote específico a descontar
  esParadaMultiLote?:     boolean  // multi-lote: parada intermedia, no pedir motivo
}

export type RegistrarPickingResult = {
  valido:             boolean
  mensaje:            string
  cantidadDespachada: number
  stockRestante:      number
  notaCompleta:       boolean
}

export type RegistrarSinStockInput = {
  usuarioId:          string
  notaProductoId:     string
  comentarioOperador: string
}

export type ConcluirParcialInput = {
  usuarioId:          string
  notaProductoId:     string
  comentarioOperador?: string
}

export type ConcluirParcialResult = {
  notaProductoId: string
  notaCompleta:   boolean
}

export type CambiarEstadoInput = {
  adminId:      string
  notaId:       string
  nuevoEstado:  'despachada'
  nombreChofer: string
}

export type CambiarEstadoResult = {
  notaId:        string
  estado:        'despachada'
  despachoId:    string
  nombreChofer:  string
  fechaDespacho: string
}

export type EnviarARevisionInput = {
  adminId: string
  notaId:  string
}

export type EnviarARevisionResult = {
  notaId: string
  estado: 'completa'
}

//Constantes (prefijos que sirve para equivalente en caso de S.STOCK)

const PREFIJOS_EQUIVALENTES = ['HX', 'EK', 'BOL', 'BO', 'GT', 'BK'] as const

//Helpers

// Cache en memoria: los workers de Cloudflare reutilizan instancias entre requests,
// así que este Map persiste y evita una query a BD por cada operación admin (M6).
const _adminCache = new Map<string, { esAdmin: boolean; expiresAt: number }>()

async function verificarAdmin(adminId: string): Promise<boolean> {
  const cached = _adminCache.get(adminId)
  if (cached && cached.expiresAt > Date.now()) return cached.esAdmin
  const { data } = await supabase.from('usuarios').select('rol').eq('id', adminId).single()
  const esAdmin = data?.rol === 'admin' || data?.rol === 'supervisor'
  _adminCache.set(adminId, { esAdmin, expiresAt: Date.now() + 30_000 })
  return esAdmin
}

async function obtenerUbicacionesFifo(productoId: string): Promise<Ubicacion[]> {
  const { data } = await supabase
    .from('lotes_inventario')
    .select('id, cantidad, fecha_ingreso, created_at, posiciones_rack(codigo)')
    .eq('producto_id', productoId)
    .eq('activo', true)
    .gte('cantidad', 0)
    .not('posicion_id', 'is', null)
    .order('fecha_ingreso', { ascending: true })
    .order('created_at', { ascending: true })

  type LoteRaw = { id: string; cantidad: number; fecha_ingreso: string; created_at: string; posiciones_rack: { codigo: string } | null }

  return (data as LoteRaw[] ?? [])
    .map((l) => ({
      loteId:         l.id,
      posicionCodigo: l.posiciones_rack?.codigo ?? null,
      cantidad:       l.cantidad,
      fechaIngreso:   l.fecha_ingreso,
    }))
}

async function obtenerEquivalentesConStock(sku: string): Promise<ProductoConStock[]> {
  const prefijo = PREFIJOS_EQUIVALENTES.find((p) => sku.startsWith(p))
  if (!prefijo) return []
  const sufijo = sku.slice(prefijo.length)

  const skusEquivalentes = PREFIJOS_EQUIVALENTES
    .filter((p) => p !== prefijo)
    .map((p) => `${p}${sufijo}`)

  const { data: productos } = await supabase
    .from('productos')
    .select('id, sku, nombre, codigo_barra, codigo_barra_alternativo')
    .in('sku', skusEquivalentes)
    .eq('activo', true)

  if (!productos?.length) return []

  const ubicacionesPorProducto = await Promise.all(productos.map((p) => obtenerUbicacionesFifo(p.id)))
  return productos.map((p, i) => ({
    productoId:           p.id,
    sku:                  p.sku,
    nombre:               p.nombre,
    codigoBarra:          p.codigo_barra,
    codigoBaRalternativo: p.codigo_barra_alternativo,
    stockDisponible:      ubicacionesPorProducto[i].reduce((s, u) => s + u.cantidad, 0),
    ubicaciones:          ubicacionesPorProducto[i],
  }))
}

async function enriquecerNotaProducto(
  np: NotaProducto & { productos: { sku: string; nombre: string; codigo_barra: string; codigo_barra_alternativo?: string | null } | null;
                       productos_equivalente?: { sku: string; codigo_barra: string; codigo_barra_alternativo?: string | null } | null }
): Promise<NotaProductoResumen> {
  const sku = np.productos?.sku ?? ''
  const [ubicaciones, equivalentes] = await Promise.all([
    obtenerUbicacionesFifo(np.producto_id),
    obtenerEquivalentesConStock(sku),
  ])

  // Si se pickeó un equivalente, usar su código de barra para la revisión
  const prod = np.producto_equivalente_id ? np.productos_equivalente : np.productos
  const codigoBarra          = prod?.codigo_barra ?? ''
  const codigoBaRalternativo = prod?.codigo_barra_alternativo ?? null

  return {
    notaProductoId:        np.id,
    productoId:            np.producto_id,
    sku,
    nombre:                np.productos?.nombre ?? '',
    codigoBarra,
    codigoBaRalternativo,
    cantidadSolicitada:    np.cantidad_solicitada,
    cantidadDespachada:    np.cantidad_despachada,
    estado:                np.estado,
    ubicaciones,
    productoEquivalenteId: np.producto_equivalente_id,
    skuEquivalente:        np.productos_equivalente?.sku ?? null,
    comentarioOperador:    np.comentario_operador,
    revisadoAdmin:         np.revisado_admin,
    equivalentes,
  }
}

async function evaluarEstadoNota(notaId: string, usuarioId: string | null, notaData: { numero_nota: string; nombre_cliente: string }): Promise<boolean> {
  const { data: items } = await supabase
    .from('nota_productos')
    .select('estado, comentario_operador')
    .eq('nota_venta_id', notaId)

  if (!items?.length) return false

  // Un ítem parcial cuenta como terminado cuando el operador ya lo cerró
  // con una justificación (comentario_operador) — a su criterio, sin más picking pendiente.
  const terminados = items.every((i) =>
    i.estado === 'completo' || i.estado === 'sin_stock' || (i.estado === 'parcial' && !!i.comentario_operador)
  )
  if (!terminados) return false

  // El estado anterior siempre es 'preparacion' en este punto del flujo.
  // Eliminado el SELECT separado de notas_venta para reducir round-trips (M3).
  const estadoAnterior = 'preparacion'

  await supabase.from('notas_venta').update({ estado: 'completa', tomada_por: null, tomada_en: null, fecha_preparacion: new Date().toISOString(), completada_por_id: usuarioId ?? null }).eq('id', notaId)

  // TC-NTA-006: EVT-008 cambio de estado automático — solo si hay un usuario a quien
  // atribuir el movimiento (p.ej. no cuando se autocorrige al simplemente leer la nota).
  if (usuarioId) {
    await supabase.from('movimientos').insert({
      tipo:          'cambio_estado_nota',
      nota_venta_id: notaId,
      usuario_id:    usuarioId,
      detalle: {
        numeroNota:    notaData.numero_nota,
        nombreCliente: notaData.nombre_cliente,
        estadoAnterior,
        estadoNuevo:   'completa',
        completadoPor:  usuarioId,
        rol:            'operador',
      },
    })
  }

  return true
}

// ── Service ────────────────────────────────────────────────────────────────

export const notasService = {

  async obtenerNotas(estado?: string): Promise<ServiceResult<NotaResumen[]>> {
    // Liberar notas abandonadas (sin actividad >10 min) antes de listar
    await supabase.rpc('liberar_notas_abandonadas')

    type RawNota = NotaVenta & {
      nota_productos: { id: string; estado: string; cantidad_despachada: number | null }[]
      usuarios: { nombre: string } | null
      devoluciones: { devolucion_items: { cantidad: number }[] }[]
    }

    let q = supabase
      .from('notas_venta')
      .select('*, nota_productos(id, estado, cantidad_despachada), usuarios!notas_venta_importado_por_fkey(nombre), devoluciones(devolucion_items(cantidad))')
      .order('created_at', { ascending: false })
    if (estado) q = q.eq('estado', estado)

    const { data, error } = await q
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const notas = (data as RawNota[] ?? [])

    // Para notas completas: buscar en movimientos quién hizo el cambio a 'completa'
    // Funciona para notas históricas (antes de la col completada_por_id) y futuras.
    const completaIds = notas.filter(n => n.estado === 'completa').map(n => n.id)
    const completadoresPorNota = new Map<string, string>()

    if (completaIds.length > 0) {
      const { data: movs } = await supabase
        .from('movimientos')
        .select('nota_venta_id, fecha, usuarios(nombre)')
        .eq('tipo', 'cambio_estado_nota')
        .contains('detalle', { estadoNuevo: 'completa' })
        .in('nota_venta_id', completaIds)
        .order('fecha', { ascending: false })

      // Para cada nota tomar el movimiento más reciente (ya vienen desc por fecha)
      for (const m of ((movs ?? []) as { nota_venta_id: string; usuarios: { nombre: string } | null }[])) {
        if (!completadoresPorNota.has(m.nota_venta_id) && m.usuarios?.nombre) {
          completadoresPorNota.set(m.nota_venta_id, m.usuarios.nombre)
        }
      }
    }

    const result: NotaResumen[] = notas.map((n) => ({
      notaId:             n.id,
      numeroNota:         n.numero_nota,
      nombreCliente:      n.nombre_cliente,
      estado:             n.estado,
      totalProductos:     n.nota_productos.length,
      productosCompletos: n.nota_productos.filter((p) => ['completo', 'sin_stock'].includes(p.estado)).length,
      creadoEn:           n.created_at,
      importadoPor:       n.usuarios?.nombre ?? '',
      tomadaPor:          n.tomada_por ?? null,
      completadaPor:      completadoresPorNota.get(n.id) ?? null,
      tieneDev:           (n.devoluciones?.length ?? 0) > 0,
      tipoDev: (() => {
        if (!n.devoluciones?.length) return null
        const totalDespachado = n.nota_productos.reduce((s, p) => s + (p.cantidad_despachada ?? 0), 0)
        const totalDevuelto   = n.devoluciones.flatMap(d => d.devolucion_items).reduce((s, i) => s + i.cantidad, 0)
        return totalDevuelto >= totalDespachado ? 'total' : 'parcial'
      })(),
      fechaPreparacion:   (n as any).fecha_preparacion ?? null,
      fechaDespacho:      (n as any).fecha_despacho ?? null,
    }))

    return { ok: true, data: result }
  },

  async obtenerDetalleNota(notaId: string, usuarioId?: string): Promise<ServiceResult<DetalleNota>> {
    const { data, error } = await supabase
      .from('notas_venta')
      .select(`
        *,
        nota_productos(
          *,
          productos!nota_productos_producto_id_fkey(sku, nombre, codigo_barra, codigo_barra_alternativo),
          productos_equivalente:productos!nota_productos_producto_equivalente_id_fkey(sku, codigo_barra, codigo_barra_alternativo)
        ),
        devoluciones(id, devolucion_items(cantidad, productos(sku, nombre)))
      `)
      .eq('id', notaId)
      .single()

    if (error || !data) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Nota no encontrada', field: 'notaId' } }
    }

    // Bloquear si la nota está en preparacion Y tomada por un operador distinto.
    // No llamamos tomar_nota aquí para evitar side-effects (el RPC cambia estado
    // y puede retornar false para el mismo usuario si el lock aún está activo).
    if (
      usuarioId &&
      data.estado === 'preparacion' &&
      data.tomada_por &&
      data.tomada_por !== usuarioId
    ) {
      return {
        ok: false,
        error: {
          code: 'CONFLICT_NOTA_TOMADA',
          message: 'Esta nota está siendo preparada por otro operador',
        },
      }
    }

    // Autocorrección: si quedó "pendiente" pero todos sus ítems ya están
    // terminados (p.ej. se cerró un parcial y nadie volvió a pickear después),
    // recalcular el estado al leer la nota en vez de esperar a la próxima escritura.
    let estadoNota = data.estado
    if (estadoNota === 'pendiente' || estadoNota === 'preparacion') {
      const quedoCompleta = await evaluarEstadoNota(notaId, usuarioId ?? null, { numero_nota: data.numero_nota, nombre_cliente: data.nombre_cliente })
      if (quedoCompleta) estadoNota = 'completa'
    }

    type NPRaw = NotaProducto & {
      productos: { sku: string; nombre: string; codigo_barra: string } | null
      productos_equivalente: { sku: string; codigo_barra: string } | null
    }

    const productosEnriquecidos = await Promise.all(
      (data.nota_productos as NPRaw[]).map((np) => enriquecerNotaProducto(np))
    )

    return {
      ok: true,
      data: {
        notaId:             data.id,
        numeroNota:         data.numero_nota,
        nombreCliente:      data.nombre_cliente,
        rutCliente:         data.rut_cliente,
        numeroOc:           data.numero_oc,
        comentarioDespacho: data.comentario_despacho ?? null,
        estado:             estadoNota,
        fechaPreparacion:   (data as any).fecha_preparacion ?? null,
        fechaDespacho:      (data as any).fecha_despacho ?? null,
        productos:          productosEnriquecidos,
        devolucion:         (() => {
          const devs = (data as any).devoluciones
          if (!devs?.length) return null
          const items = devs.flatMap((d: any) =>
            (d.devolucion_items ?? []).map((di: any) => ({
              sku:      di.productos?.sku ?? '',
              nombre:   di.productos?.nombre ?? '',
              cantidad: di.cantidad,
            }))
          )
          return { items }
        })(),
      },
    }
  },

  async crearNota(input: CrearNotaInput): Promise<ServiceResult<CrearNotaResult>> {
    if (!(await verificarAdmin(input.adminId))) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo el Admin puede crear notas de venta' } }
    }

    if (!input.productos.length) {
      return { ok: false, error: { code: 'VALIDATION_PRODUCTOS_VACIOS', message: 'Debe incluir al menos un producto' } }
    }

    // TC-NTA-001: verificar nota duplicada
    const { data: existe } = await supabase
      .from('notas_venta')
      .select('id')
      .eq('numero_nota', input.numeroNota)
      .single()

    if (existe) {
      return { ok: false, error: { code: 'CONFLICT_NOTA_DUPLICADA', message: `Ya existe una nota con número ${input.numeroNota}` } }
    }

    const { data: nota, error: errorNota } = await supabase
      .from('notas_venta')
      .insert({
        numero_nota:          input.numeroNota,
        nombre_cliente:       input.nombreCliente,
        rut_cliente:          input.rutCliente,
        numero_oc:            input.numeroOc ?? null,
        importado_por:        input.adminId,
        estado:               'pendiente',
        archivo_nombre:       input.archivoNombre ?? null,
        comentario_despacho:  input.comentarioDespacho?.trim() || null,
      })
      .select()
      .single()

    if (errorNota || !nota) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorNota?.message ?? 'Error al crear nota' } }
    }

    const npInsert = input.productos.map((p) => ({
      nota_venta_id:      nota.id,
      producto_id:        p.productoId,
      cantidad_solicitada: p.cantidadSolicitada,
      cantidad_despachada: 0,
      estado:             'pendiente',
    }))

    const { data: npCreados, error: errorNP } = await supabase
      .from('nota_productos')
      .insert(npInsert)
      .select('*, productos!nota_productos_producto_id_fkey(sku, nombre, codigo_barra)')

    if (errorNP || !npCreados) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorNP?.message ?? 'Error al crear ítems' } }
    }

    type NPRaw = NotaProducto & { productos: { sku: string; nombre: string; codigo_barra: string } | null; productos_equivalente: null }

    const productosEnriquecidos = await Promise.all(
      (npCreados as NPRaw[]).map((np) => enriquecerNotaProducto({ ...np, productos_equivalente: null }))
    )

    return {
      ok: true,
      data: { notaId: nota.id, numeroNota: nota.numero_nota, estado: 'pendiente', productos: productosEnriquecidos },
    }
  },

  async registrarPicking(input: RegistrarPickingInput): Promise<ServiceResult<RegistrarPickingResult>> {
    // Obtener nota_producto con datos completos
    const { data: np, error: errorNP } = await supabase
      .from('nota_productos')
      .select(`
        *,
        notas_venta(id, estado, numero_nota, nombre_cliente, rut_cliente),
        productos!nota_productos_producto_id_fkey(id, sku, nombre, codigo_barra, codigo_barra_alternativo)
      `)
      .eq('id', input.notaProductoId)
      .single()

    if (errorNP || !np) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Ítem no encontrado', field: 'notaProductoId' } }
    }

    type NotaRef    = { id: string; estado: string; numero_nota: string; nombre_cliente: string; rut_cliente: string }
    type ProductoRef = { id: string; sku: string; nombre: string; codigo_barra: string; codigo_barra_alternativo?: string | null }

    const notaRef    = np.notas_venta as NotaRef
    const productoRef = np.productos as ProductoRef

    if (notaRef.estado !== 'pendiente' && notaRef.estado !== 'preparacion') {
      return { ok: false, error: { code: 'CONFLICT_NOTA_NO_PENDIENTE', message: `La nota está en estado '${notaRef.estado}'` } }
    }

    // Tomar la nota atómicamente (previene concurrencia entre operadores)
    if (notaRef.estado === 'pendiente') {
      const { data: tomada } = await supabase.rpc('tomar_nota', {
        p_nota_id:    notaRef.id,
        p_usuario_id: input.usuarioId,
      })
      if (!tomada) {
        return {
          ok: false,
          error: { code: 'NOTA_TOMADA', message: 'Esta nota ya está siendo procesada por otro operador' },
        }
      }
    }

    // Determinar qué producto usar (original o equivalente)
    const usarEquivalente   = input.usarEquivalente === true && !!input.productoEquivalenteId
    const productoPickId    = usarEquivalente ? input.productoEquivalenteId! : productoRef.id

    // Obtener producto a picar (puede ser el equivalente)
    let productoPickRef = productoRef
    if (usarEquivalente) {
      const { data: prodEq } = await supabase
        .from('productos')
        .select('id, sku, nombre, codigo_barra, codigo_barra_alternativo')
        .eq('id', input.productoEquivalenteId!)
        .single()
      if (!prodEq) return { ok: false, error: { code: 'NOT_FOUND', message: 'Producto equivalente no encontrado' } }
      productoPickRef = prodEq
    }

    // Validar producto escaneado (acepta codigo_barra principal o alternativo)
    const barcodeOk = input.codigoProducto === productoPickRef.codigo_barra
      || (!!productoPickRef.codigo_barra_alternativo && input.codigoProducto === productoPickRef.codigo_barra_alternativo)
    if (!barcodeOk) {
      return {
        ok: false,
        error: { code: 'INVALID_PRODUCTO', message: `El producto escaneado no coincide. Esperado: ${productoPickRef.sku}`, field: 'codigoProducto' },
      }
    }

    // Obtener lotes FIFO del producto a picar
    const { data: lotes, error: errorLotes } = await supabase
      .from('lotes_inventario')
      .select('*, posiciones_rack(id, codigo)')
      .eq('producto_id', productoPickId)
      .eq('activo', true)
      .gt('cantidad', 0)
      .order('fecha_ingreso', { ascending: true })
      .order('created_at', { ascending: true }) // TC-FIFO-005

    if (errorLotes) return { ok: false, error: { code: 'DB_ERROR', message: errorLotes.message } }

    type LoteRaw = typeof lotes[number] & { posiciones_rack: { id: string; codigo: string } | null }
    const lotesFifo = lotes as LoteRaw[]

    // Bloquear despacho superior a lo solicitado en la nota
    const cantidadPendiente = np.cantidad_solicitada - np.cantidad_despachada
    if (input.cantidad > cantidadPendiente) {
      return {
        ok: false,
        error: {
          code: 'EXCEDE_SOLICITADO',
          message: `No puedes despachar más de lo solicitado — pendiente: ${cantidadPendiente}`,
        },
      }
    }

    // Si es envío parcial, comentario es obligatorio (excepto en paradas intermedias multi-lote)
    if (input.cantidad < cantidadPendiente && !input.esParadaMultiLote && !input.comentarioOperador?.trim()) {
      return {
        ok: false,
        error: {
          code: 'COMENTARIO_REQUERIDO',
          message: 'Debes indicar el motivo del despacho parcial',
        },
      }
    }

    // ── MODO SALIDA LIBRE ──────────────────────────────────────────────────────
    // Si no hay stock registrado, la salida se registra directamente sin lote.
    // El stock físico existe pero aún no está en el sistema.
    // Cuando se integre Softland, el stock ya estará descontado de estas salidas previas.

    const stockDisponible = lotesFifo.reduce((sum, l) => sum + l.cantidad, 0)
    const nuevaDespachada = np.cantidad_despachada + input.cantidad
    const estadoItem      = nuevaDespachada >= np.cantidad_solicitada ? 'completo' : 'parcial'
    const esSalidaCompleta = nuevaDespachada >= np.cantidad_solicitada

    // Actualizar nota_producto
    const { error: errorNPUp } = await supabase
      .from('nota_productos')
      .update({
        cantidad_despachada:     nuevaDespachada,
        estado:                  estadoItem,
        producto_equivalente_id: usarEquivalente ? input.productoEquivalenteId : null,
        ...(input.comentarioOperador ? { comentario_operador: input.comentarioOperador } : {}),
      })
      .eq('id', input.notaProductoId)

    if (errorNPUp) return { ok: false, error: { code: 'DB_ERROR', message: errorNPUp.message } }

    if (stockDisponible === 0) {
      // Sin lotes: salida libre directa sin descontar de inventario
      if (usarEquivalente) {
        await supabase.from('movimientos').insert({
          tipo:          'equivalente_usado',
          nota_venta_id: notaRef.id,
          producto_id:   productoRef.id,
          cantidad:      input.cantidad,
          usuario_id:    input.usuarioId,
          detalle: {
            numeroNota:    notaRef.numero_nota,
            nombreCliente: notaRef.nombre_cliente,
            productoOriginal: { sku: productoRef.sku, nombre: productoRef.nombre, stockDisponible: 0 },
            productoEquivalente: { sku: productoPickRef.sku, nombre: productoPickRef.nombre, cantidad: input.cantidad, ubicacion: null },
          },
        })
      }

      await supabase.from('movimientos').insert({
        tipo:          esSalidaCompleta ? 'salida' : 'salida_parcial',
        nota_venta_id: notaRef.id,
        lote_id:       null,
        producto_id:   productoPickId,
        cantidad:      input.cantidad,
        usuario_id:    input.usuarioId,
        detalle: esSalidaCompleta
          ? { numeroNota: notaRef.numero_nota, nombreCliente: notaRef.nombre_cliente, sku: productoPickRef.sku, nombreProducto: productoPickRef.nombre, cantidadSolicitada: np.cantidad_solicitada, cantidadDespachada: nuevaDespachada, ubicacion: null, salidaLibre: true }
          : { numeroNota: notaRef.numero_nota, nombreCliente: notaRef.nombre_cliente, sku: productoPickRef.sku, nombreProducto: productoPickRef.nombre, cantidadSolicitada: np.cantidad_solicitada, cantidadDespachada: nuevaDespachada, cantidadFaltante: np.cantidad_solicitada - nuevaDespachada, razon: input.esParadaMultiLote ? 'multi_lote' : 'parcial_operador', comentarioOperador: input.comentarioOperador ?? null, ubicacion: null, salidaLibre: true },
      })
    } else {
      // Con lotes reales: deducción FIFO normal
      const loteEsperado = input.loteId
        ? (lotesFifo.find(l => l.id === input.loteId) ?? lotesFifo[0])
        : lotesFifo[0]

      // Decremento atómico: la resta ocurre en la BD para evitar race condition
      // cuando dos tablets leen el mismo lote concurrentemente (H1).
      const { data: descontarResult, error: errorLoteUp } = await supabase
        .rpc('descontar_lote', { p_lote_id: loteEsperado.id, p_cantidad: input.cantidad })

      if (errorLoteUp) return { ok: false, error: { code: 'DB_ERROR', message: errorLoteUp.message } }
      if (!descontarResult?.ok) {
        return { ok: false, error: { code: 'STOCK_INSUFICIENTE', message: 'Stock insuficiente al momento de registrar. Intenta nuevamente.' } }
      }
      const cantidadRestanteLote = descontarResult.cantidad_nueva as number

      // TC-FIFO-003: si el lote se agotó y tenía rack asignado, liberar posición
      if (cantidadRestanteLote === 0 && loteEsperado.posiciones_rack?.id) {
        await supabase
          .from('posiciones_rack')
          .update({ ocupada: false })
          .eq('id', loteEsperado.posiciones_rack.id)
      }

      const ubicacion = { rack: loteEsperado.posiciones_rack?.codigo ?? null, fechaIngresoLote: loteEsperado.fecha_ingreso }

      if (usarEquivalente) {
        await supabase.from('movimientos').insert({
          tipo:          'equivalente_usado',
          nota_venta_id: notaRef.id,
          producto_id:   productoRef.id,
          cantidad:      input.cantidad,
          usuario_id:    input.usuarioId,
          detalle: {
            numeroNota:    notaRef.numero_nota,
            nombreCliente: notaRef.nombre_cliente,
            productoOriginal: { sku: productoRef.sku, nombre: productoRef.nombre, stockDisponible: 0 },
            productoEquivalente: { sku: productoPickRef.sku, nombre: productoPickRef.nombre, cantidad: input.cantidad, ubicacion },
          },
        })
      }

      await supabase.from('movimientos').insert({
        tipo:          esSalidaCompleta ? 'salida' : 'salida_parcial',
        nota_venta_id: notaRef.id,
        lote_id:       loteEsperado.id,
        producto_id:   productoPickId,
        cantidad:      input.cantidad,
        usuario_id:    input.usuarioId,
        detalle: esSalidaCompleta
          ? { numeroNota: notaRef.numero_nota, nombreCliente: notaRef.nombre_cliente, sku: productoPickRef.sku, nombreProducto: productoPickRef.nombre, cantidadSolicitada: np.cantidad_solicitada, cantidadDespachada: nuevaDespachada, ubicacion }
          : { numeroNota: notaRef.numero_nota, nombreCliente: notaRef.nombre_cliente, sku: productoPickRef.sku, nombreProducto: productoPickRef.nombre, cantidadSolicitada: np.cantidad_solicitada, cantidadDespachada: nuevaDespachada, cantidadFaltante: np.cantidad_solicitada - nuevaDespachada, razon: input.esParadaMultiLote ? 'multi_lote' : 'parcial_operador', comentarioOperador: input.comentarioOperador ?? null, ubicacion },
      })
    }
    // ──────────────────────────────────────────────────────────────────────────

    // TC-NTA-006: evaluar si la nota quedó completa
    const notaCompleta = await evaluarEstadoNota(notaRef.id, input.usuarioId, { numero_nota: notaRef.numero_nota, nombre_cliente: notaRef.nombre_cliente })

    // Calcular stock restante del producto
    const { data: prodActual } = await supabase
      .from('productos')
      .select('stock_total')
      .eq('id', productoPickId)
      .single()

    return {
      ok: true,
      data: {
        valido:             true,
        mensaje:            esSalidaCompleta ? 'Producto despachado correctamente' : `Parcial — quedan ${np.cantidad_solicitada - nuevaDespachada} por despachar`,
        cantidadDespachada: nuevaDespachada,
        stockRestante:      prodActual?.stock_total ?? 0,
        notaCompleta,
      },
    }
  },

  async registrarSinStock(input: RegistrarSinStockInput): Promise<ServiceResult<{ notaProductoId: string; estado: string; comentario: string }>> {
    // TC-NTA-008: comentario obligatorio
    if (!input.comentarioOperador.trim()) {
      return { ok: false, error: { code: 'VALIDATION_COMENTARIO_VACIO', message: 'El comentario es obligatorio al registrar sin stock' } }
    }

    const { data: np, error } = await supabase
      .from('nota_productos')
      .select('*, notas_venta(id, estado, numero_nota, nombre_cliente), productos!nota_productos_producto_id_fkey(sku, nombre)')
      .eq('id', input.notaProductoId)
      .single()

    if (error || !np) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Ítem no encontrado', field: 'notaProductoId' } }
    }

    type NotaRef    = { id: string; estado: string; numero_nota: string; nombre_cliente: string }
    type ProductoRef = { sku: string; nombre: string }

    const notaRef    = np.notas_venta as NotaRef
    const productoRef = np.productos as ProductoRef

    await supabase
      .from('nota_productos')
      .update({ estado: 'sin_stock', comentario_operador: input.comentarioOperador })
      .eq('id', input.notaProductoId)

    // EVT-004: salida_parcial con razón sin_stock_sin_equivalente
    await supabase.from('movimientos').insert({
      tipo:          'salida_parcial',
      nota_venta_id: notaRef.id,
      producto_id:   np.producto_id,
      usuario_id:    input.usuarioId,
      detalle: {
        numeroNota:         notaRef.numero_nota,
        nombreCliente:      notaRef.nombre_cliente,
        sku:                productoRef.sku,
        nombreProducto:     productoRef.nombre,
        cantidadSolicitada: np.cantidad_solicitada,
        cantidadDespachada: np.cantidad_despachada,
        cantidadFaltante:   np.cantidad_solicitada - np.cantidad_despachada,
        razon:              'sin_stock_sin_equivalente',
        comentarioOperador: input.comentarioOperador,
      },
    })

    await evaluarEstadoNota(notaRef.id, input.usuarioId, { numero_nota: notaRef.numero_nota, nombre_cliente: notaRef.nombre_cliente })

    return { ok: true, data: { notaProductoId: input.notaProductoId, estado: 'sin_stock', comentario: input.comentarioOperador } }
  },

  // Cierre manual de un ítem parcial, a criterio del operador — no depende de que
  // ya exista un comentario previo; el propio operador decide que no seguirá pickeando.
  async concluirParcial(input: ConcluirParcialInput): Promise<ServiceResult<ConcluirParcialResult>> {
    const { data: np, error } = await supabase
      .from('nota_productos')
      .select('*, notas_venta(id, numero_nota, nombre_cliente), productos!nota_productos_producto_id_fkey(sku, nombre)')
      .eq('id', input.notaProductoId)
      .single()

    if (error || !np) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Ítem no encontrado', field: 'notaProductoId' } }
    }

    if (np.estado !== 'parcial') {
      return { ok: false, error: { code: 'ESTADO_INVALIDO', message: 'Solo se puede concluir un ítem que esté en estado parcial' } }
    }

    const comentarioFinal = input.comentarioOperador?.trim() || np.comentario_operador
    if (!comentarioFinal) {
      return { ok: false, error: { code: 'COMENTARIO_REQUERIDO', message: 'Debes indicar el motivo para dar por concluido este ítem' } }
    }

    type NotaRef     = { id: string; numero_nota: string; nombre_cliente: string }
    type ProductoRef = { sku: string; nombre: string }

    const notaRef     = np.notas_venta as NotaRef
    const productoRef = np.productos as ProductoRef

    await supabase
      .from('nota_productos')
      .update({ comentario_operador: comentarioFinal })
      .eq('id', input.notaProductoId)

    await supabase.from('movimientos').insert({
      tipo:          'salida_parcial',
      nota_venta_id: notaRef.id,
      producto_id:   np.producto_id,
      usuario_id:    input.usuarioId,
      detalle: {
        numeroNota:         notaRef.numero_nota,
        nombreCliente:      notaRef.nombre_cliente,
        sku:                productoRef.sku,
        nombreProducto:     productoRef.nombre,
        cantidadSolicitada: np.cantidad_solicitada,
        cantidadDespachada: np.cantidad_despachada,
        cantidadFaltante:   np.cantidad_solicitada - np.cantidad_despachada,
        razon:              'cierre_operador',
        comentarioOperador: comentarioFinal,
      },
    })

    const notaCompleta = await evaluarEstadoNota(notaRef.id, input.usuarioId, { numero_nota: notaRef.numero_nota, nombre_cliente: notaRef.nombre_cliente })

    return { ok: true, data: { notaProductoId: input.notaProductoId, notaCompleta } }
  },

  async enviarARevision(input: EnviarARevisionInput): Promise<ServiceResult<EnviarARevisionResult>> {
    if (!(await verificarAdmin(input.adminId))) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo el Admin puede enviar notas a revisión directa' } }
    }

    const { data: nota, error } = await supabase
      .from('notas_venta')
      .select('id, estado, numero_nota, nombre_cliente')
      .eq('id', input.notaId)
      .single()

    if (error || !nota) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Nota no encontrada', field: 'notaId' } }
    }

    if (nota.estado !== 'pendiente' && nota.estado !== 'preparacion') {
      return { ok: false, error: { code: 'CONFLICT_ESTADO_INVALIDO', message: `La nota ya está en estado '${nota.estado}'` } }
    }

    await supabase.from('notas_venta').update({ estado: 'completa' }).eq('id', input.notaId)

    await supabase.from('movimientos').insert({
      tipo:          'cambio_estado_nota',
      nota_venta_id: input.notaId,
      usuario_id:    input.adminId,
      detalle: {
        numeroNota:     nota.numero_nota,
        nombreCliente:  nota.nombre_cliente,
        estadoAnterior: nota.estado,
        estadoNuevo:    'completa',
        motivo:         'envio_directo_revision',
      },
    })

    return { ok: true, data: { notaId: input.notaId, estado: 'completa' } }
  },

  async cambiarEstadoNota(input: CambiarEstadoInput): Promise<ServiceResult<CambiarEstadoResult>> {
    // TC-NTA-010: solo Admin
    if (!(await verificarAdmin(input.adminId))) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo el Admin puede marcar notas para despacho' } }
    }

    if (!input.nombreChofer.trim()) {
      return { ok: false, error: { code: 'VALIDATION_CHOFER_VACIO', message: 'El nombre del chofer es obligatorio' } }
    }

    const { data: nota, error } = await supabase
      .from('notas_venta')
      .select('*, nota_productos(estado, comentario_operador)')
      .eq('id', input.notaId)
      .single()

    if (error || !nota) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Nota no encontrada', field: 'notaId' } }
    }

    // TC-NTA-011: solo desde 'completa'
    if (nota.estado !== 'completa') {
      return {
        ok: false,
        error: { code: 'CONFLICT_ESTADO_INVALIDO', message: `Solo se puede pasar a 'despachada' desde estado 'completa'. Estado actual: '${nota.estado}'` },
      }
    }

    // Crear registro en despachos
    const fechaDespacho = new Date().toISOString()
    const { data: despacho, error: errorDespacho } = await supabase
      .from('despachos')
      .insert({ nota_venta_id: input.notaId, nombre_chofer: input.nombreChofer, validado_por: input.adminId, fecha_despacho: fechaDespacho })
      .select()
      .single()

    if (errorDespacho || !despacho) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorDespacho?.message ?? 'Error al crear despacho' } }
    }

    await supabase.from('notas_venta').update({ estado: 'despachada', nombre_chofer: input.nombreChofer, fecha_despacho: fechaDespacho }).eq('id', input.notaId)

    type NPEstado = { estado: string; comentario_operador: string | null }
    const nps = nota.nota_productos as NPEstado[]

    // EVT-008 cambio de estado
    await supabase.from('movimientos').insert({
      tipo:          'cambio_estado_nota',
      nota_venta_id: input.notaId,
      usuario_id:    input.adminId,
      detalle: {
        numeroNota:    nota.numero_nota,
        nombreCliente: nota.nombre_cliente,
        estadoAnterior: 'completa',
        estadoNuevo:   'despachada',
        validadoPor:   input.adminId,
        rol:           'admin',
      },
    })

    // EVT-009 despacho
    await supabase.from('movimientos').insert({
      tipo:          'despacho',
      nota_venta_id: input.notaId,
      usuario_id:    input.adminId,
      detalle: {
        numeroNota:              nota.numero_nota,
        nombreCliente:           nota.nombre_cliente,
        rutCliente:              nota.rut_cliente,
        nombreChofer:            input.nombreChofer,
        fechaDespacho,
        totalProductos:          nps.length,
        productosDespachados:    nps.filter((p) => p.estado === 'completo').length,
        productosConObservacion: nps.filter((p) => p.comentario_operador).length,
      },
    })

    return {
      ok: true,
      data: { notaId: input.notaId, estado: 'despachada', despachoId: despacho.id, nombreChofer: input.nombreChofer, fechaDespacho },
    }
  },

  async anularNota(input: { adminId: string; notaId: string; motivo: string }): Promise<ServiceResult<{ notaId: string; estado: string }>> {
    if (!(await verificarAdmin(input.adminId))) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo el Admin puede anular notas' } }
    }
    if (!input.motivo.trim()) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'El motivo de anulación es obligatorio' } }
    }

    const { data: nota, error } = await supabase
      .from('notas_venta')
      .select('id, numero_nota, nombre_cliente, estado')
      .eq('id', input.notaId)
      .single()

    if (error || !nota) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Nota no encontrada' } }
    }
    if (nota.estado === 'anulada') {
      return { ok: false, error: { code: 'CONFLICT_ESTADO_INVALIDO', message: 'La nota ya está anulada' } }
    }

    const { error: errUp } = await supabase
      .from('notas_venta')
      .update({ estado: 'anulada', comentario_despacho: input.motivo.trim() })
      .eq('id', input.notaId)

    if (errUp) {
      return { ok: false, error: { code: 'DB_ERROR', message: errUp.message } }
    }

    await supabase.from('movimientos').insert({
      tipo:          'cambio_estado_nota',
      nota_venta_id: input.notaId,
      usuario_id:    input.adminId,
      detalle: {
        numeroNota:     nota.numero_nota,
        nombreCliente:  nota.nombre_cliente,
        estadoAnterior: nota.estado,
        estadoNuevo:    'anulada',
        motivo:         input.motivo.trim(),
        anuladorPor:    input.adminId,
        rol:            'admin',
      },
    })

    return { ok: true, data: { notaId: input.notaId, estado: 'anulada' } }
  },

  async editarNota(input: {
    adminId: string
    notaId: string
    modificaciones: { notaProductoId: string; cantidad: number; nuevoSku?: string }[]
    nuevos: { sku: string; cantidad: number }[]
    eliminar: string[]
  }): Promise<ServiceResult<{ notaId: string }>> {
    if (!(await verificarAdmin(input.adminId))) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo el Admin puede editar notas' } }
    }

    const { data: nota, error: errNota } = await supabase
      .from('notas_venta')
      .select('id, numero_nota, nombre_cliente, estado')
      .eq('id', input.notaId)
      .single()

    if (errNota || !nota) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Nota no encontrada' } }
    }
    if (nota.estado !== 'pendiente') {
      return { ok: false, error: { code: 'CONFLICT_ESTADO_INVALIDO', message: 'Solo se pueden editar notas en estado pendiente' } }
    }

    // Modificar ítems existentes
    for (const mod of input.modificaciones) {
      if (mod.cantidad <= 0) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'La cantidad debe ser mayor a 0' } }
      }
      const upd: Record<string, unknown> = { cantidad_solicitada: mod.cantidad }
      if (mod.nuevoSku) {
        const { data: prod } = await supabase
          .from('productos')
          .select('id')
          .eq('sku', mod.nuevoSku.trim().toUpperCase())
          .single()
        if (!prod) {
          return { ok: false, error: { code: 'NOT_FOUND', message: `SKU no encontrado: ${mod.nuevoSku}` } }
        }
        upd.producto_id = prod.id
      }
      const { error: errMod } = await supabase
        .from('nota_productos')
        .update(upd)
        .eq('id', mod.notaProductoId)
        .eq('nota_venta_id', input.notaId)
      if (errMod) {
        return { ok: false, error: { code: 'DB_ERROR', message: errMod.message } }
      }
    }

    // Agregar ítems nuevos
    for (const nuevo of input.nuevos) {
      if (nuevo.cantidad <= 0) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'La cantidad debe ser mayor a 0' } }
      }
      const { data: prod } = await supabase
        .from('productos')
        .select('id')
        .eq('sku', nuevo.sku.trim().toUpperCase())
        .single()
      if (!prod) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `SKU no encontrado: ${nuevo.sku}` } }
      }
      const { error: errIns } = await supabase
        .from('nota_productos')
        .insert({ nota_venta_id: input.notaId, producto_id: prod.id, cantidad_solicitada: nuevo.cantidad, estado: 'pendiente' })
      if (errIns) {
        return { ok: false, error: { code: 'DB_ERROR', message: errIns.message } }
      }
    }

    // Eliminar ítems
    if (input.eliminar.length > 0) {
      const { error: errDel } = await supabase
        .from('nota_productos')
        .delete()
        .in('id', input.eliminar)
        .eq('nota_venta_id', input.notaId)
      if (errDel) {
        return { ok: false, error: { code: 'DB_ERROR', message: errDel.message } }
      }
    }

    await supabase.from('movimientos').insert({
      tipo:          'edicion_nota',
      nota_venta_id: input.notaId,
      usuario_id:    input.adminId,
      detalle: {
        numeroNota:      nota.numero_nota,
        modificaciones:  input.modificaciones.length,
        nuevos:          input.nuevos.length,
        eliminados:      input.eliminar.length,
        editadoPor:      input.adminId,
        rol:             'admin',
      },
    })

    return { ok: true, data: { notaId: input.notaId } }
  },

  async eliminarNota(input: { adminId: string; notaId: string }): Promise<ServiceResult<{ notaId: string }>> {
    if (!(await verificarAdmin(input.adminId))) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo el Admin puede eliminar notas' } }
    }

    const { data: nota, error: errNota } = await supabase
      .from('notas_venta')
      .select('id, numero_nota, nombre_cliente, estado')
      .eq('id', input.notaId)
      .single()

    if (errNota || !nota) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Nota no encontrada' } }
    }
    if (nota.estado !== 'pendiente') {
      return { ok: false, error: { code: 'CONFLICT_ESTADO_INVALIDO', message: 'Solo se pueden eliminar notas en estado pendiente' } }
    }

    const { error: errUp } = await supabase
      .from('notas_venta')
      .update({ estado: 'anulada', comentario_despacho: 'Nota eliminada por administrador' })
      .eq('id', input.notaId)

    if (errUp) {
      return { ok: false, error: { code: 'DB_ERROR', message: errUp.message } }
    }

    await supabase.from('movimientos').insert({
      tipo:          'cambio_estado_nota',
      nota_venta_id: input.notaId,
      usuario_id:    input.adminId,
      detalle: {
        numeroNota:    nota.numero_nota,
        nombreCliente: nota.nombre_cliente,
        estadoAnterior: 'pendiente',
        estadoNuevo:    'anulada',
        motivo:         'Nota eliminada por administrador',
        eliminadoPor:   input.adminId,
        rol:            'admin',
      },
    })

    return { ok: true, data: { notaId: input.notaId } }
  },

  async contarParaNotificaciones(rol: string, desde: string | null): Promise<ServiceResult<{
    notas:    { id: string; numero_nota: string; estado: string }[]
    sesiones: { id: string; numero_oc: string; nombre_cliente: string; estado: string }[]
  }>> {
    if (rol === 'operador') {
      let qNotas = supabase.from('notas_venta').select('id, numero_nota, estado').eq('estado', 'pendiente')
      if (desde) qNotas = qNotas.gt('created_at', desde)

      let qSesiones = supabase.from('sesiones_picking_masivo')
        .select('id, numero_oc, nombre_cliente, estado')
        .in('estado', ['validando', 'en_proceso'])
      if (desde) qSesiones = qSesiones.gt('creado_en', desde)

      const [rNotas, rSesiones] = await Promise.all([qNotas, qSesiones])
      return { ok: true, data: { notas: rNotas.data ?? [], sesiones: rSesiones.data ?? [] } }
    }

    if (rol === 'supervisor') {
      const [rNotas, rSesiones] = await Promise.all([
        supabase.from('notas_venta').select('id, numero_nota, estado').eq('estado', 'completa'),
        supabase.from('sesiones_picking_masivo').select('id, numero_oc, nombre_cliente, estado').eq('estado', 'completada'),
      ])
      return { ok: true, data: { notas: rNotas.data ?? [], sesiones: rSesiones.data ?? [] } }
    }

    // admin: notas completa (operador terminó) y despachada (supervisor despachó)
    let qNotas = supabase.from('notas_venta')
      .select('id, numero_nota, estado')
      .in('estado', ['completa', 'despachada'])
    if (desde) qNotas = qNotas.gt('updated_at', desde)

    const [rNotas, rSesiones] = await Promise.all([
      qNotas,
      supabase.from('sesiones_picking_masivo')
        .select('id, numero_oc, nombre_cliente, estado')
        .in('estado', ['completada', 'despachado'])
        .order('completada_en', { ascending: false })
        .limit(20),
    ])
    return { ok: true, data: { notas: rNotas.data ?? [], sesiones: rSesiones.data ?? [] } }
  },
}
