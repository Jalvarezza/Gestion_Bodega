import { apiClient } from '../../../shared/utils/apiClient'
import type { InfoPosicion, InfoProducto, RegistroLoteResult } from '../../../../api/inventario-inicial/inventarioInicial.service'

export type { InfoPosicion, InfoProducto, RegistroLoteResult }

export const inventarioInicialApi = {
  resolverPosicion: (codigo: string) =>
    apiClient.post<InfoPosicion>('/inventario-inicial?accion=resolver-posicion', { codigo }),

  resolverProducto: (codigoBarra: string) =>
    apiClient.post<InfoProducto>('/inventario-inicial?accion=resolver-producto', { codigoBarra }),

  registrarLote: (body: {
    usuarioId:    string
    posicionId:   string
    productoId:   string
    cantidad:     number
    fechaIngreso: string
  }) => apiClient.post<RegistroLoteResult>('/inventario-inicial?accion=registrar', body),

  eliminarLote: (loteId: string) =>
    apiClient.post<{ ok: true }>('/inventario-inicial?accion=eliminar-lote', { loteId }),

  buscarLotePorPosicion: (codigoPosicion: string) =>
    apiClient.post<{ loteId: string; skuProducto: string; nombreProducto: string; posicionCodigo: string; posicionId: string }>(
      '/inventario-inicial?accion=buscar-lote-posicion', { codigoPosicion }
    ),
}
