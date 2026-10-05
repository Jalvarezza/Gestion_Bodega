// @ts-nocheck
import { supabase } from '../lib/supabase/client'

const _adminCache = new Map<string, { esAdmin: boolean; expiresAt: number }>()
async function verificarAdmin(adminId: string): Promise<boolean> {
  const cached = _adminCache.get(adminId)
  if (cached && cached.expiresAt > Date.now()) return cached.esAdmin
  const { data } = await supabase.from('usuarios').select('rol').eq('id', adminId).single()
  const esAdmin = data?.rol === 'admin' || data?.rol === 'supervisor'
  _adminCache.set(adminId, { esAdmin, expiresAt: Date.now() + 30_000 })
  return esAdmin
}
import type { ServiceResult } from '../../src/shared/types/base'
import type { Database } from '../lib/supabase/types'

type NotaVenta = Database['public']['Tables']['notas_venta']['Row']

export type NotaResumen = NotaVenta & {
  totalProductos:  number
  totalRevisados:  number
}

export type ValidarProductoInput = {
  adminId:           string
  notaProductoId:    string
  codigoProducto:    string
  cantidadIngresada: number
}

export type ValidarProductoResult = {
  valido:        boolean
  cantidadEsperada: number
  mensaje:       'Producto revisado'
  todosRevisados: boolean
}

export const salidasService = {
  async obtenerNotasParaRevision(): Promise<ServiceResult<NotaResumen[]>> {
    const { data, error } = await supabase
      .from('notas_venta')
      .select('*, nota_productos(id, revisado_admin, cantidad_despachada), devoluciones(devolucion_items(cantidad))')
      .in('estado', ['completa', 'despachada'])
      .order('updated_at', { ascending: false })

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    type RawNota = NotaVenta & {
      nota_productos: { id: string; revisado_admin: boolean; cantidad_despachada: number | null }[]
      devoluciones:   { devolucion_items: { cantidad: number }[] }[]
    }
    const notas = data as RawNota[] ?? []

    const result: NotaResumen[] = notas.map((nota) => ({
      ...nota,
      totalProductos:      nota.nota_productos.length,
      totalRevisados:      nota.nota_productos.filter((np) => np.revisado_admin).length,
      nombreChofer:        (nota as any).nombre_chofer ?? null,
      comentarioDespacho:  nota.comentario_despacho ?? null,
      tieneDev:            (nota.devoluciones?.length ?? 0) > 0,
      tipoDev: (() => {
        if (!nota.devoluciones?.length) return null
        const totalDespachado = nota.nota_productos.reduce((s, p) => s + (p.cantidad_despachada ?? 0), 0)
        const totalDevuelto   = nota.devoluciones.flatMap(d => d.devolucion_items).reduce((s, i) => s + i.cantidad, 0)
        return totalDevuelto >= totalDespachado ? 'total' : 'parcial'
      })(),
    }))

    return { ok: true, data: result }
  },

  async validarProductoRevision(input: ValidarProductoInput): Promise<ServiceResult<ValidarProductoResult>> {
    // TC-SAL-004: verificar rol admin (con cache de 30 seg, M6)
    if (!(await verificarAdmin(input.adminId))) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Solo el Admin puede revisar notas para despacho' } }
    }

    // Obtener nota_producto con producto y nota padre
    const { data: notaProducto, error: errorNP } = await supabase
      .from('nota_productos')
      .select(`
        *,
        productos!nota_productos_producto_id_fkey(codigo_barra, codigo_barra_alternativo, sku, nombre),
        productos_equivalente:productos!nota_productos_producto_equivalente_id_fkey(codigo_barra, codigo_barra_alternativo, sku),
        notas_venta(id, estado, numero_nota)
      `)
      .eq('id', input.notaProductoId)
      .single()

    if (errorNP || !notaProducto) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Ítem de nota no encontrado', field: 'notaProductoId' } }
    }

    // Verificar que la nota está en estado 'completa'
    type NotaRef = { id: string; estado: string; numero_nota: string }
    const notaRef = notaProducto.notas_venta as NotaRef

    if (notaRef.estado !== 'completa') {
      return {
        ok: false,
        error: {
          code: 'CONFLICT_NOTA_NO_COMPLETA',
          message: `La nota está en estado '${notaRef.estado}'. Solo se pueden revisar notas en estado 'completa'`,
        },
      }
    }

    // Verificar que el producto escaneado corresponde al ítem
    type ProductoRef = { codigo_barra: string; codigo_barra_alternativo: string | null; sku: string; nombre: string }
    const productoRef    = notaProducto.productos as ProductoRef
    const equivalenteRef = notaProducto.productos_equivalente as { codigo_barra: string; codigo_barra_alternativo: string | null; sku: string } | null

    const refActual = notaProducto.producto_equivalente_id ? equivalenteRef : productoRef
    const codigoEsperado  = refActual?.codigo_barra ?? null
    const codigoAlternativo = refActual?.codigo_barra_alternativo ?? null
    const skuEsperado = notaProducto.producto_equivalente_id
      ? (equivalenteRef?.sku ?? productoRef.sku)
      : productoRef.sku

    const normalizar = (s: string) => s.replace(/^0+/, '')
    const escaneado  = normalizar(input.codigoProducto)
    const coincide   = !codigoEsperado
      || normalizar(codigoEsperado) === escaneado
      || (codigoAlternativo && normalizar(codigoAlternativo) === escaneado)

    if (!coincide) {
      return {
        ok: false,
        error: {
          code: 'INVALID_PRODUCTO',
          message: `El producto escaneado no corresponde a este ítem. Esperado: ${skuEsperado}`,
          field: 'codigoProducto',
        },
      }
    }

    // La referencia es lo que despachó el operador en NV Preparación
    const cantidadReferencia = notaProducto.cantidad_despachada || notaProducto.cantidad_solicitada

    // Marcar revisado_admin y confirmar cantidad_despachada
    const { error: errorUpdate } = await supabase
      .from('nota_productos')
      .update({ revisado_admin: true, cantidad_despachada: cantidadReferencia })
      .eq('id', input.notaProductoId)

    if (errorUpdate) {
      return { ok: false, error: { code: 'DB_ERROR', message: errorUpdate.message } }
    }

    // EV-001: registrar auditoría de revisión
    await supabase.from('movimientos').insert({
      tipo:          'revision_admin',
      nota_venta_id: notaRef.id,
      producto_id:   notaProducto.producto_id,
      cantidad:      cantidadReferencia,
      usuario_id:    input.adminId,
      detalle: {
        numeroNota:         notaRef.numero_nota,
        sku:                productoRef.sku,
        nombreProducto:     productoRef.nombre,
        cantidadSolicitada: cantidadReferencia,
        cantidadRevisada:   cantidadReferencia,
      },
    })

    // EV-002: registrar salida en historial
    await supabase.from('movimientos').insert({
      tipo:          'salida',
      nota_venta_id: notaRef.id,
      producto_id:   notaProducto.producto_id,
      cantidad:      cantidadReferencia,
      usuario_id:    input.adminId,
      detalle: {
        numeroNota:        notaRef.numero_nota,
        sku:               productoRef.sku,
        nombreProducto:    productoRef.nombre,
        cantidadSolicitada: cantidadReferencia,
        cantidadDespachada: cantidadReferencia,
      },
    })

    // Verificar si todos los ítems de la nota ya fueron revisados
    // Los sin_stock se cuentan como revisados automáticamente
    const { data: todosItems } = await supabase
      .from('nota_productos')
      .select('id, revisado_admin, estado')
      .eq('nota_venta_id', notaRef.id)

    const todosRevisados = (todosItems ?? []).every(
      (item) => item.revisado_admin || item.id === input.notaProductoId || item.estado === 'sin_stock'
    )

    return {
      ok: true,
      data: {
        valido:           true,
        cantidadEsperada: cantidadReferencia,
        mensaje:          'Producto validado correctamente',
        todosRevisados,
      },
    }
  },
}
