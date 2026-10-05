// @ts-nocheck
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'
import type { Database } from '../lib/supabase/types'

type Importacion        = Database['public']['Tables']['importaciones']['Row']
type ImportacionDetalle = Database['public']['Tables']['importacion_detalles']['Row']

//Tipos públicos

export type CrearImportacionInput = {
  adminId:       string
  numeroOc:      string
  archivoNombre: string
  productos: { productoId: string; cantidadEsperada: number }[]
}

export type CrearImportacionResult = {
  importacionId: string
  codigo:        string
  fechaIngreso:  string
  estado:        'pendiente'
  detalles: {
    detalleId:        string
    productoId:       string
    cantidadEsperada: number
    cantidadRecibida: number
    estado:           'pendiente'
  }[]
}

export type ValidarCantidadInput = {
  detalleId:         string
  cantidadIngresada: number
}

export type ValidarCantidadResult = {
  valido:            boolean
  cantidadEsperada:  number
  cantidadIngresada: number
  diferencia:        number
  esIngresoParcial:  boolean
  mensaje:           string
}

export type AlmacenarEnRackInput = {
  adminId:             string
  detalleId:           string
  posicionId:          string
  cantidad:            number
  agregarAMismoProducto?: boolean
}

export type AlmacenarEnRackResult = {
  loteId:       string
  codigoRack:   string
  cantidad:     number
  fechaIngreso: string
  restante:     number
}

export type AlmacenarEnPasilloInput = {
  adminId:   string
  detalleId: string
  pasilloId: string
  cantidad:  number
}

export type AlmacenarEnPasilloResult = {
  loteId:        string
  codigoPasillo: string
  cantidad:      number
  fechaIngreso:  string
  restante:      number
}

export type ImportacionResumen = {
  importacionId:      string
  codigo:             string
  numeroOc:           string
  fechaIngreso:       string
  estado:             string
  totalProductos:     number
  productosCompletos: number
}

export type DetalleImportacion = {
  importacionId:  string
  codigo:         string
  numeroOc:       string
  fechaIngreso:   string
  estado:         string
  importadoPor:   string
  archivoNombre:  string | null
  detalles: {
    detalleId:        string
    productoId:       string
    sku:              string
    nombre:           string
    codigoBarra:      string | null
    cantidadEsperada: number
    cantidadRecibida: number
    estado:           string
    alto_cm:          number
    largo_cm:         number
    ancho_cm:         number
    ubicacion:        string | null
  }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function generarCodigoImportacion(año: number): Promise<string> {
  // Llama a función SQL con advisory lock para serializar concurrencia (H4).
  const { data, error } = await supabase.rpc('generar_codigo_importacion', { p_año: año })
  if (error || !data) throw new Error(`No se pudo generar código de importación: ${error?.message}`)
  return data as string
}

const _adminCache = new Map<string, { esAdmin: boolean; expiresAt: number }>()

async function verificarAdmin(adminId: string): Promise<boolean> {
  const cached = _adminCache.get(adminId)
  if (cached && cached.expiresAt > Date.now()) return cached.esAdmin
  const { data } = await supabase.from('usuarios').select('rol').eq('id', adminId).single()
  const esAdmin = data?.rol === 'admin'
  _adminCache.set(adminId, { esAdmin, expiresAt: Date.now() + 30_000 })
  return esAdmin
}

//Service

export const ingresosService = {

  async obtenerImportaciones(estado?: string): Promise<ServiceResult<ImportacionResumen[]>> {
    let query = supabase
      .from('importaciones')
      .select('*, importacion_detalles(id, estado)')
      .order('fecha_ingreso', { ascending: false })

    if (estado) query = query.eq('estado', estado)

    const { data, error } = await query
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    type RawImportacion = Importacion & {
      importacion_detalles: { id: string; estado: string }[]
    }

    const result: ImportacionResumen[] = (data as RawImportacion[] ?? []).map((imp) => ({
      importacionId:      imp.id,
      codigo:             imp.codigo,
      numeroOc:           imp.numero_oc,
      fechaIngreso:       imp.fecha_ingreso,
      estado:             imp.estado,
      totalProductos:     imp.importacion_detalles.length,
      productosCompletos: imp.importacion_detalles.filter((d) => d.estado === 'completa').length,
    }))

    return { ok: true, data: result }
  },

  async obtenerDetalleImportacion(importacionId: string): Promise<ServiceResult<DetalleImportacion>> {
    const { data, error } = await supabase
      .from('importaciones')
      .select(`
        *,
        usuarios!importaciones_importado_por_fkey(nombre),
        importacion_detalles(*, productos!importacion_detalles_producto_id_fkey(sku, nombre, codigo_barra, alto_cm, largo_cm, ancho_cm), lotes_inventario(posiciones_rack(codigo)))
      `)
      .eq('id', importacionId)
      .single()

    if (error || !data) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Importación no encontrada', field: 'importacionId' } }
    }

    type DetalleRaw = ImportacionDetalle & {
      productos: { sku: string; nombre: string; codigo_barra: string | null; alto_cm: number; largo_cm: number; ancho_cm: number } | null
      lotes_inventario: { posiciones_rack: { codigo: string } | null }[]
    }
    type UsuarioRef = { nombre: string } | null

    const result: DetalleImportacion = {
      importacionId:  data.id,
      codigo:         data.codigo,
      numeroOc:       data.numero_oc,
      fechaIngreso:   data.fecha_ingreso,
      estado:         data.estado,
      importadoPor:   (data.usuarios as UsuarioRef)?.nombre ?? '',
      archivoNombre:  data.archivo_nombre,
      detalles: (data.importacion_detalles as DetalleRaw[]).map((d) => ({
        detalleId:        d.id,
        productoId:       d.producto_id,
        sku:              d.productos?.sku ?? '',
        nombre:           d.productos?.nombre ?? '',
        codigoBarra:      d.productos?.codigo_barra ?? null,
        cantidadEsperada: d.cantidad_esperada,
        cantidadRecibida: d.cantidad_recibida,
        estado:           d.estado,
        alto_cm:          d.productos?.alto_cm ?? 0,
        largo_cm:         d.productos?.largo_cm ?? 0,
        ancho_cm:         d.productos?.ancho_cm ?? 0,
        ubicacion:        d.lotes_inventario?.[0]?.posiciones_rack?.codigo ?? null,
      })),
    }

    return { ok: true, data: result }
  },

  async crearImportacion(input: CrearImportacionInput): Promise<ServiceResult<CrearImportacionResult>> {
    if (!(await verificarAdmin(input.adminId))) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo el Admin puede crear importaciones' } }
    }

    if (!input.productos.length) {
      return { ok: false, error: { code: 'VALIDATION_PRODUCTOS_VACIOS', message: 'Debe incluir al menos un producto' } }
    }

    // Verificar OC duplicada
    const { data: ocExiste } = await supabase
      .from('importaciones')
      .select('id')
      .eq('numero_oc', input.numeroOc.trim())
      .single()

    if (ocExiste) {
      return { ok: false, error: { code: 'CONFLICT_OC_DUPLICADA', message: `Ya existe una importación con la OC ${input.numeroOc.trim()}` } }
    }

    // Verificar que todos los productos existen
    const ids = input.productos.map((p) => p.productoId)
    const { data: productosExisten } = await supabase
      .from('productos')
      .select('id')
      .in('id', ids)

    if ((productosExisten?.length ?? 0) !== ids.length) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Uno o más productos no existen', field: 'productos' } }
    }

    const fechaIngreso = new Date().toISOString().slice(0, 10)
    const año          = new Date().getFullYear()
    const codigo       = await generarCodigoImportacion(año)

    const { data: importacion, error: errorImp } = await supabase
      .from('importaciones')
      .insert({
        codigo,
        numero_oc:      input.numeroOc,
        fecha_ingreso:  fechaIngreso,
        importado_por:  input.adminId,
        estado:         'pendiente',
        archivo_nombre: input.archivoNombre,
      })
      .select()
      .single()

    if (errorImp || !importacion) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorImp?.message ?? 'Error al crear importación' } }
    }

    const detallesInsert = input.productos.map((p) => ({
      importacion_id:    importacion.id,
      producto_id:       p.productoId,
      cantidad_esperada: p.cantidadEsperada,
      cantidad_recibida: 0,
      estado:            'pendiente',
    }))

    const { data: detalles, error: errorDet } = await supabase
      .from('importacion_detalles')
      .insert(detallesInsert)
      .select()

    if (errorDet || !detalles) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorDet?.message ?? 'Error al crear detalles' } }
    }

    return {
      ok: true,
      data: {
        importacionId: importacion.id,
        codigo,
        fechaIngreso,
        estado:        'pendiente',
        detalles: detalles.map((d) => ({
          detalleId:        d.id,
          productoId:       d.producto_id,
          cantidadEsperada: d.cantidad_esperada,
          cantidadRecibida: 0,
          estado:           'pendiente' as const,
        })),
      },
    }
  },

  async validarCantidadIngreso(input: ValidarCantidadInput): Promise<ServiceResult<ValidarCantidadResult>> {
    if (input.cantidadIngresada <= 0) {
      return { ok: false, error: { code: 'VALIDATION_CANTIDAD_CERO', message: 'La cantidad debe ser mayor a 0' } }
    }

    const { data: detalle, error } = await supabase
      .from('importacion_detalles')
      .select('cantidad_esperada, cantidad_recibida')
      .eq('id', input.detalleId)
      .single()

    if (error || !detalle) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Detalle no encontrado', field: 'detalleId' } }
    }

    const pendiente        = detalle.cantidad_esperada - detalle.cantidad_recibida
    const diferencia       = input.cantidadIngresada - pendiente
    const esIngresoParcial = input.cantidadIngresada < pendiente

    let mensaje: string
    if (input.cantidadIngresada === pendiente)    mensaje = 'Cantidad correcta'
    else if (esIngresoParcial)                    mensaje = `Ingreso parcial — quedan ${pendiente - input.cantidadIngresada} unidades pendientes`
    else                                          mensaje = `Excede lo pendiente en ${diferencia} unidades`

    return {
      ok: true,
      data: {
        valido:            input.cantidadIngresada <= pendiente,
        cantidadEsperada:  detalle.cantidad_esperada,
        cantidadIngresada: input.cantidadIngresada,
        diferencia,
        esIngresoParcial,
        mensaje,
      },
    }
  },

  async almacenarEnRack(input: AlmacenarEnRackInput): Promise<ServiceResult<AlmacenarEnRackResult>> {
    if (!(await verificarAdmin(input.adminId))) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo el Admin puede almacenar en rack' } }
    }

    // Obtener detalle + importacion (para fecha_ingreso de OC) + producto
    const { data: detalle, error: errorDet } = await supabase
      .from('importacion_detalles')
      .select(`
        *,
        importaciones(fecha_ingreso, codigo, numero_oc),
        productos!importacion_detalles_producto_id_fkey(sku, nombre)
      `)
      .eq('id', input.detalleId)
      .single()

    if (errorDet || !detalle) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Detalle no encontrado', field: 'detalleId' } }
    }

    // TC-ING-005: cantidad no puede exceder lo pendiente
    const pendiente = detalle.cantidad_esperada - detalle.cantidad_recibida
    if (input.cantidad > pendiente) {
      return {
        ok: false,
        error: { code: 'VALIDATION_CANTIDAD_EXCEDE', message: `La cantidad excede lo pendiente. Máximo permitido: ${pendiente}` },
      }
    }

    // Obtener posición
    const { data: posicion, error: errorPos } = await supabase
      .from('posiciones_rack')
      .select('*')
      .eq('id', input.posicionId)
      .single()

    if (errorPos || !posicion) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Posición no encontrada', field: 'posicionId' } }
    }

    if (!posicion.activo) {
      return { ok: false, error: { code: 'CONFLICT_RACK_INACTIVO', message: 'La posición está inactiva' } }
    }

    // TC-ING-004: posición ya ocupada
    if (posicion.ocupada) {
      if (!input.agregarAMismoProducto) {
        return { ok: false, error: { code: 'CONFLICT_POSICION_OCUPADA', message: 'La posición ya está ocupada por otro producto' } }
      }
      // Validar que el producto existente en la posición es el mismo que se está ingresando
      const { data: loteExistente } = await supabase
        .from('lotes_inventario')
        .select('producto_id')
        .eq('posicion_id', input.posicionId)
        .eq('activo', true)
        .limit(1)
        .single()
      if (loteExistente && loteExistente.producto_id !== detalle.producto_id) {
        return { ok: false, error: { code: 'CONFLICT_POSICION_OTRO_PRODUCTO', message: 'La posición tiene un producto diferente' } }
      }
    } else {
      // Reclamar la posición atómicamente antes de insertar el lote (H5).
      // Si otro admin ganó la carrera entre el SELECT y este UPDATE, 0 filas son
      // afectadas y retornamos CONFLICT en vez de insertar dos lotes en la misma posición.
      const { data: claimed } = await supabase
        .from('posiciones_rack')
        .update({ ocupada: true })
        .eq('id', input.posicionId)
        .eq('ocupada', false)
        .select('id')

      if (!claimed || claimed.length === 0) {
        return { ok: false, error: { code: 'CONFLICT_POSICION_OCUPADA', message: 'La posición acaba de ser ocupada por otra operación. Selecciona otra posición.' } }
      }
    }

    type ProductoRef = { sku: string; nombre: string } | null
    type ImportacionRef = { fecha_ingreso: string; codigo: string; numero_oc: string } | null

    const productoRef    = detalle.productos as ProductoRef
    const importacionRef = detalle.importaciones as ImportacionRef

    // TC-ING-006: fecha_ingreso del lote = fecha de la OC, no la fecha actual
    const fechaIngresoLote = importacionRef?.fecha_ingreso ?? new Date().toISOString().slice(0, 10)

    // Crear lote — CONSTRAINT ubicacion_exclusiva: posicion_id IS NOT NULL → en_pasillo=false, pasillo_id=NULL
    const { data: lote, error: errorLote } = await supabase
      .from('lotes_inventario')
      .insert({
        importacion_id:        detalle.importacion_id,
        importacion_detalle_id: input.detalleId,
        producto_id:           detalle.producto_id,
        cantidad:              input.cantidad,
        fecha_ingreso:         fechaIngresoLote,
        posicion_id:           input.posicionId,
        pasillo_id:            null,
        en_pasillo:            false,
      })
      .select()
      .single()

    if (errorLote || !lote) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorLote?.message ?? 'Error al crear lote' } }
    }

    // posición ya marcada como ocupada atómicamente antes de la inserción del lote

    // Incremento atómico: suma y validación ocurren en la BD para evitar race condition (H7).
    const { data: incResult, error: errorInc } = await supabase
      .rpc('incrementar_cantidad_recibida', { p_detalle_id: input.detalleId, p_cantidad: input.cantidad })

    if (errorInc) return { ok: false, error: { code: 'DB_ERROR', message: errorInc.message } }
    if (!incResult?.ok) {
      return { ok: false, error: { code: 'VALIDATION_CANTIDAD_EXCEDE', message: 'La cantidad excede lo pendiente. Otra tablet puede haber almacenado antes. Recarga e intenta nuevamente.' } }
    }

    const estadoDetalle = incResult.estado as string
    const restante      = incResult.restante as number

    // stock_total se recalcula automáticamente vía trigger trg_recalcular_stock al insertar el lote

    // EV-001: movimiento de auditoría
    const tipoEvento = estadoDetalle === 'completa' ? 'ingreso' : 'ingreso_parcial'
    await supabase.from('movimientos').insert({
      tipo:           tipoEvento,
      importacion_id: detalle.importacion_id,
      producto_id:    detalle.producto_id,
      lote_id:        lote.id,
      cantidad:       input.cantidad,
      usuario_id:     input.adminId,
      detalle: {
        importacionCodigo:  importacionRef?.codigo ?? '',
        numeroOc:           importacionRef?.numero_oc ?? '',
        sku:                productoRef?.sku ?? '',
        nombreProducto:     productoRef?.nombre ?? '',
        cantidadEsperada:   detalle.cantidad_esperada,
        cantidadIngresada:  input.cantidad,
        ubicacion:          posicion.codigo,
        fechaIngreso:       fechaIngresoLote,
      },
    })

    // Recalcular estado de la importación
    await ingresosService._recalcularEstadoImportacion(detalle.importacion_id)

    return {
      ok: true,
      data: {
        loteId:       lote.id,
        codigoRack:   posicion.codigo,
        cantidad:     input.cantidad,
        fechaIngreso: fechaIngresoLote,
        restante,
      },
    }
  },

  async almacenarEnPasillo(input: AlmacenarEnPasilloInput): Promise<ServiceResult<AlmacenarEnPasilloResult>> {
    const esAdmin = await verificarAdmin(input.adminId)
    if (!esAdmin) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo el Admin puede almacenar mercancía' } }
    }

    const { data: detalle, error: errorDet } = await supabase
      .from('importacion_detalles')
      .select('*, importaciones(fecha_ingreso, codigo, numero_oc), productos!importacion_detalles_producto_id_fkey(sku, nombre)')
      .eq('id', input.detalleId)
      .single()

    if (errorDet || !detalle) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Detalle no encontrado', field: 'detalleId' } }
    }

    const pendiente = detalle.cantidad_esperada - detalle.cantidad_recibida
    if (input.cantidad > pendiente) {
      return {
        ok: false,
        error: { code: 'VALIDATION_CANTIDAD_EXCEDE', message: `La cantidad excede lo pendiente. Máximo permitido: ${pendiente}` },
      }
    }

    const { data: pasillo, error: errorPas } = await supabase
      .from('pasillos')
      .select('id, codigo, nombre')
      .eq('id', input.pasilloId)
      .eq('activo', true)
      .single()

    if (errorPas || !pasillo) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Pasillo no encontrado', field: 'pasilloId' } }
    }

    type ImportacionRef = { fecha_ingreso: string; codigo: string; numero_oc: string } | null
    type ProductoRef    = { sku: string; nombre: string } | null

    const importacionRef = detalle.importaciones as ImportacionRef
    const productoRef    = detalle.productos as ProductoRef
    const fechaIngresoLote = importacionRef?.fecha_ingreso ?? new Date().toISOString().slice(0, 10)

    // CONSTRAINT ubicacion_exclusiva: pasillo_id IS NOT NULL → en_pasillo=true, posicion_id=NULL
    const { data: lote, error: errorLote } = await supabase
      .from('lotes_inventario')
      .insert({
        importacion_id:         detalle.importacion_id,
        importacion_detalle_id: input.detalleId,
        producto_id:            detalle.producto_id,
        cantidad:               input.cantidad,
        fecha_ingreso:          fechaIngresoLote,
        posicion_id:            null,
        pasillo_id:             input.pasilloId,
        en_pasillo:             true,
      })
      .select()
      .single()

    if (errorLote || !lote) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorLote?.message ?? 'Error al crear lote' } }
    }

    // Incremento atómico: suma y validación ocurren en la BD para evitar race condition (H7).
    const { data: incResult, error: errorInc } = await supabase
      .rpc('incrementar_cantidad_recibida', { p_detalle_id: input.detalleId, p_cantidad: input.cantidad })

    if (errorInc) return { ok: false, error: { code: 'DB_ERROR', message: errorInc.message } }
    if (!incResult?.ok) {
      return { ok: false, error: { code: 'VALIDATION_CANTIDAD_EXCEDE', message: 'La cantidad excede lo pendiente. Otra tablet puede haber almacenado antes. Recarga e intenta nuevamente.' } }
    }

    const estadoDetalle = incResult.estado as string
    const restante      = incResult.restante as number

    // stock_total se recalcula automáticamente vía trigger trg_recalcular_stock al insertar el lote

    const tipoEvento = estadoDetalle === 'completa' ? 'ingreso' : 'ingreso_parcial'
    await supabase.from('movimientos').insert({
      tipo:           tipoEvento,
      importacion_id: detalle.importacion_id,
      producto_id:    detalle.producto_id,
      lote_id:        lote.id,
      cantidad:       input.cantidad,
      usuario_id:     input.adminId,
      detalle: {
        importacionCodigo: importacionRef?.codigo ?? '',
        numeroOc:          importacionRef?.numero_oc ?? '',
        sku:               productoRef?.sku ?? '',
        nombreProducto:    productoRef?.nombre ?? '',
        cantidadEsperada:  detalle.cantidad_esperada,
        cantidadIngresada: input.cantidad,
        ubicacion:         pasillo.codigo,
        fechaIngreso:      fechaIngresoLote,
      },
    })

    await ingresosService._recalcularEstadoImportacion(detalle.importacion_id)

    return {
      ok: true,
      data: {
        loteId:        lote.id,
        codigoPasillo: pasillo.codigo,
        cantidad:      input.cantidad,
        fechaIngreso:  fechaIngresoLote,
        restante,
      },
    }
  },

  // Interno: recalcula estado de importación en una sola transacción BD (M4).
  async _recalcularEstadoImportacion(importacionId: string): Promise<void> {
    await supabase.rpc('recalcular_estado_importacion', { p_importacion_id: importacionId })
  },
}
