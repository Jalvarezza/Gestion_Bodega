import { apiClient } from '../../../shared/utils/apiClient'
import type {
  MovimientoHistorial,
  ObtenerMovimientosInput,
  ObtenerMovimientosResult,
  MovimientosPorIngresoResult,
  MovimientosPorNotaResult,
  OCResumen,
  ProductoEnOC,
} from '../../../../api/historial/historial.service'

export type { MovimientoHistorial, ObtenerMovimientosInput, ObtenerMovimientosResult, MovimientosPorIngresoResult, MovimientosPorNotaResult, OCResumen, ProductoEnOC }

export type MovimientosPorTrasladoResult = {
  trasladoId:      string
  tipo:            string
  realizadoPor:    string
  fechaTraslado:   string
  origen:          string
  destino:         string
  productoOrigen:  string
  productoDestino: string | null
}

export const TIPOS_MOVIMIENTO = [
  'ingreso',
  'ingreso_parcial',
  'salida',
  'salida_parcial',
  'traslado_reubicacion',
  'traslado_intercambio',
  'equivalente_usado',
  'devolucion',
] as const

export type TipoFiltro = typeof TIPOS_MOVIMIENTO[number]

export const TIPO_LABELS: Record<string, string> = {
  ingreso:               'Ingreso',
  ingreso_parcial:       'Ingreso parcial',
  salida:                'Salida',
  salida_parcial:        'Salida parcial',
  traslado_reubicacion:  'Traslado re-ubicación',
  traslado_intercambio:  'Traslado intercambio',
  equivalente_usado:     'Equivalente usado',
  cambio_estado_nota:    'Cambio estado nota',
  despacho:              'Despacho',
  devolucion:            'Devolución',
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
  return q ? `?${q}` : ''
}

export const historialApi = {
  getMovimientos: (input: ObtenerMovimientosInput | null) =>
    apiClient.get<ObtenerMovimientosResult>(
      `/historial${buildQuery((input ?? {}) as Record<string, string | number | undefined>)}`
    ),

  getMovimientosPorIngreso: (importacionId: string) =>
    apiClient.get<MovimientosPorIngresoResult>(`/historial?vista=ingreso&id=${importacionId}`),

  getMovimientosPorNota: (notaId: string) =>
    apiClient.get<MovimientosPorNotaResult>(`/historial?vista=nota&id=${notaId}`),

  getMovimientosPorTraslado: (trasladoId: string) =>
    apiClient.get<MovimientosPorTrasladoResult>(`/historial?vista=traslado&id=${trasladoId}`),

  getListaOCs: () =>
    apiClient.get<OCResumen[]>('/historial?vista=ocs'),

  getProductosPorOC: (importacionId: string) =>
    apiClient.get<ProductoEnOC[]>(`/historial?vista=oc-productos&id=${importacionId}`),

  getMovimientosPorOCYProducto: (importacionId: string, productoId: string) =>
    apiClient.get<MovimientoHistorial[]>(`/historial?vista=oc-producto&importacionId=${importacionId}&productoId=${productoId}`),
}
