import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'
import type { Database } from '../lib/supabase/types'

type Producto = Database['public']['Tables']['productos']['Row']

const PREFIJOS_EQUIVALENTES = ['HX', 'EK', 'BOL', 'BO', 'GT', 'BK'] as const

export type ProductoConEquivalentes = Producto & {
  equivalentes: Producto[]
}

export type UbicacionProducto = {
  tipo: 'rack' | 'pasillo' | 'sin_ubicacion' | 'sin_stock'
  label: string
}

export type ProductoConUbicacion = Producto & { ubicacion: UbicacionProducto }

function obtenerEquivalentes(sku: string, todos: Producto[]): Producto[] {
  const prefijo = PREFIJOS_EQUIVALENTES.find((p) => sku.startsWith(p))
  if (!prefijo) return []
  const sufijo = sku.slice(prefijo.length)
  return todos.filter(
    (p) => p.sku !== sku && PREFIJOS_EQUIVALENTES.some((pre) => p.sku === `${pre}${sufijo}`)
  )
}

export type UbicacionDetalle = {
  loteId:          string
  posicionCodigo:  string | null
  pasilloNombre:   string | null
  tipo:            'rack' | 'pasillo' | 'sin_ubicacion'
  cantidad:        number
  fechaIngreso:    string
}

export const productosService = {

  async obtenerUbicaciones(productoId: string): Promise<ServiceResult<UbicacionDetalle[]>> {
    const { data, error } = await supabase
      .from('lotes_inventario')
      .select('id, cantidad, fecha_ingreso, posicion_id, pasillo_id, en_pasillo, posiciones_rack(codigo), pasillos(nombre)')
      .eq('producto_id', productoId)
      .eq('activo', true)
      .gt('cantidad', 0)
      .order('fecha_ingreso', { ascending: true })

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const resultado: UbicacionDetalle[] = (data ?? []).map((l) => {
      const posicionCodigo = l.posicion_id && l.posiciones_rack
        ? (Array.isArray(l.posiciones_rack)
            ? (l.posiciones_rack[0] as { codigo: string } | undefined)?.codigo
            : (l.posiciones_rack as { codigo: string }).codigo) ?? null
        : null
      const pasilloNombre = (l.pasillo_id || l.en_pasillo) && l.pasillos
        ? (Array.isArray(l.pasillos)
            ? (l.pasillos[0] as { nombre: string } | undefined)?.nombre
            : (l.pasillos as { nombre: string }).nombre) ?? null
        : null
      const tipo: UbicacionDetalle['tipo'] = posicionCodigo ? 'rack' : pasilloNombre ? 'pasillo' : 'sin_ubicacion'
      return { loteId: l.id, posicionCodigo, pasilloNombre, tipo, cantidad: l.cantidad, fechaIngreso: l.fecha_ingreso }
    })

    return { ok: true, data: resultado }
  },
  async listarProductos(): Promise<ServiceResult<Producto[]>> {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .order('nombre')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: data ?? [] }
  },

  async buscarPorCodigoBarra(codigoBarra: string): Promise<ServiceResult<ProductoConEquivalentes>> {
    const { data: todos } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)

    const producto = (todos ?? []).find(
      (p) => p.codigo_barra === codigoBarra || p.codigo_barra_alternativo === codigoBarra
    )

    if (!producto) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Producto no encontrado', field: 'codigoBarra' } }
    }

    const equivalentes = obtenerEquivalentes(producto.sku, todos ?? [])
    return { ok: true, data: { ...producto, equivalentes } }
  },

  async buscarPorSku(sku: string): Promise<ServiceResult<ProductoConEquivalentes>> {
    const { data: producto, error } = await supabase
      .from('productos')
      .select('*')
      .eq('sku', sku)
      .eq('activo', true)
      .single()

    if (error || !producto) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Producto no encontrado', field: 'sku' } }
    }

    const { data: todos } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)

    const equivalentes = obtenerEquivalentes(producto.sku, todos ?? [])
    return { ok: true, data: { ...producto, equivalentes } }
  },

  async obtenerProducto(id: string): Promise<ServiceResult<ProductoConEquivalentes>> {
    const { data: producto, error } = await supabase
      .from('productos')
      .select('*')
      .eq('id', id)
      .eq('activo', true)
      .single()

    if (error || !producto) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Producto no encontrado', field: 'id' } }
    }

    const { data: todos } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)

    const equivalentes = obtenerEquivalentes(producto.sku, todos ?? [])
    return { ok: true, data: { ...producto, equivalentes } }
  },

  async buscarPorTexto(texto: string): Promise<ServiceResult<ProductoConUbicacion[]>> {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .or(`nombre.ilike.%${texto}%,sku.ilike.%${texto}%,codigo_barra.ilike.%${texto}%,codigo_barra_alternativo.ilike.%${texto}%`)
      .order('nombre')
      .limit(50)

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const productos = data ?? []
    if (productos.length === 0) return { ok: true, data: [] }

    const ids = productos.map((p) => p.id)

    const { data: lotes } = await supabase
      .from('lotes_inventario')
      .select('producto_id, posicion_id, pasillo_id, en_pasillo, fecha_ingreso, cantidad, posiciones_rack(codigo), pasillos(nombre)')
      .in('producto_id', ids)
      .eq('activo', true)
      .gte('cantidad', 0)
      .order('fecha_ingreso', { ascending: true })

    // Agrupar lotes por producto_id, quedarnos con el primero (menor fecha_ingreso)
    type LoteRow = NonNullable<typeof lotes>[number]
    const primerosPorProducto = new Map<string, LoteRow>()
    for (const lote of lotes ?? []) {
      if (!primerosPorProducto.has(lote.producto_id)) {
        primerosPorProducto.set(lote.producto_id, lote)
      }
    }

    function resolverUbicacion(lote: LoteRow | undefined): UbicacionProducto {
      if (!lote) return { tipo: 'sin_stock', label: 'Sin stock' }
      if (lote.posicion_id && lote.posiciones_rack) {
        const codigo = Array.isArray(lote.posiciones_rack)
          ? (lote.posiciones_rack[0] as { codigo: string } | undefined)?.codigo
          : (lote.posiciones_rack as { codigo: string }).codigo
        if (codigo) return { tipo: 'rack', label: codigo }
      }
      if ((lote.pasillo_id || lote.en_pasillo) && lote.pasillos) {
        const nombre = Array.isArray(lote.pasillos)
          ? (lote.pasillos[0] as { nombre: string } | undefined)?.nombre
          : (lote.pasillos as { nombre: string }).nombre
        if (nombre) return { tipo: 'pasillo', label: nombre }
      }
      return { tipo: 'sin_ubicacion', label: 'Sin ubicación' }
    }

    const resultado: ProductoConUbicacion[] = productos.map((p) => ({
      ...p,
      ubicacion: resolverUbicacion(primerosPorProducto.get(p.id)),
    }))

    return { ok: true, data: resultado }
  },
}
