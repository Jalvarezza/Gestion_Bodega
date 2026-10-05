import { apiClient } from '../../../shared/utils/apiClient'
import type { Database } from '../../../shared/types/supabase'
import type { PasilloConRacks, RackConPosiciones } from '../../../shared/types/servicios'

type Pasillo  = Database['public']['Tables']['pasillos']['Row']
type Posicion = Database['public']['Tables']['posiciones_rack']['Row']

export type PosicionLibre = Pick<Posicion, 'id' | 'codigo' | 'alto_cm' | 'ancho_cm' | 'largo_cm' | 'nivel' | 'posicion' | 'rack_id'> & {
  rackCodigo:    string
  rackNombre:    string | null
  pasilloId:     string
  pasilloCodigo: string
  pasilloNombre: string | null
}

export type LoteMapa = {
  productoId:   string
  sku:          string
  nombre:       string
  cantidad:     number
  fechaIngreso: string
  alto_cm:      number
  largo_cm:     number
  ancho_cm:     number
}

export type PosicionMapa = {
  id:       string
  codigo:   string
  nivel:    number
  posicion: string
  ocupada:  boolean
  lote:     LoteMapa | null
}

export type RackMapa = {
  id:         string
  codigo:     string
  activo:     boolean
  posiciones: PosicionMapa[]
}

export type PasilloMapa = {
  id:     string
  codigo: string
  nombre: string
  racks:  RackMapa[]
}

export type ProductoPasilloItem = {
  loteId:       string
  cantidad:     number
  fechaIngreso: string
  sku:          string
  nombre:       string
  codigoBarra:  string | null
  marca:        string | null
  ubicacion:    'pasillo' | 'rack'
  posicion:     string | null
}

export const ubicacionesApi = {
  getMapaBodega:            ()                   => apiClient.get<PasilloMapa[]>('/ubicaciones?vista=mapa'),
  getPasillos:              ()                   => apiClient.get<Pasillo[]>('/ubicaciones'),
  getEstructura:            ()                   => apiClient.get<PasilloConRacks[]>('/ubicaciones?vista=estructura'),
  getRacks:                 (pasilloId: string)  => apiClient.get<RackConPosiciones[]>(`/ubicaciones?vista=racks&pasilloId=${pasilloId}`),
  getPosicionesLibres:      (rackId: string)     => apiClient.get<Posicion[]>(`/ubicaciones?vista=posiciones-libres&rackId=${rackId}`),
  getTodasPosicionesLibres: ()                   => apiClient.get<PosicionLibre[]>(`/ubicaciones?vista=posiciones-libres`),
  getTodasPosiciones:       ()                   => apiClient.get<PosicionLibre[]>(`/ubicaciones?vista=etiquetas`),
  getPosicion:              (posicionId: string) => apiClient.get<Posicion>(`/ubicaciones?vista=posicion&posicionId=${posicionId}`),
  getProductosPasillo:      (pasilloId: string)  => apiClient.get<ProductoPasilloItem[]>(`/ubicaciones?vista=productos-pasillo&pasilloId=${pasilloId}`),
  getProductosPosiciones:   (pasilloId: string)  => apiClient.get<ProductoPasilloItem[]>(`/ubicaciones?vista=productos-posiciones&pasilloId=${pasilloId}`),
}
