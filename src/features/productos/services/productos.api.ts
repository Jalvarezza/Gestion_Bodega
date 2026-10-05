import { apiClient } from '../../../shared/utils/apiClient'
import type { ProductoConEquivalentes, ProductoConUbicacion } from '../../../shared/types/servicios'
import type { Database } from '../../../shared/types/supabase'

type Producto = Database['public']['Tables']['productos']['Row']

export type UbicacionDetalle = {
  loteId:         string
  posicionCodigo: string | null
  pasilloNombre:  string | null
  tipo:           'rack' | 'pasillo' | 'sin_ubicacion'
  cantidad:       number
  fechaIngreso:   string
}

export type { ProductoConUbicacion }

export const productosApi = {
  getAll:           ()               => apiClient.get<Producto[]>('/productos'),
  getById:          (id: string)     => apiClient.get<ProductoConEquivalentes>(`/productos?id=${id}`),
  getBySku:         (sku: string)    => apiClient.get<ProductoConEquivalentes>(`/productos?sku=${encodeURIComponent(sku)}`),
  getByCodigoBarra: (cb: string)     => apiClient.get<ProductoConEquivalentes>(`/productos?codigoBarra=${encodeURIComponent(cb)}`),
  buscar:           (q: string)      => apiClient.get<ProductoConUbicacion[]>(`/productos?q=${encodeURIComponent(q)}`),
  getUbicaciones:   (id: string)     => apiClient.get<UbicacionDetalle[]>(`/productos?id=${id}&ubicaciones=true`),
}
