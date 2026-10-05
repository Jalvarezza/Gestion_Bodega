// Tipos de respuesta de los servicios — duplicados aquí para no importar
// desde api/ en el frontend (evita arrastrar process.env y módulos Node).
import type { Database } from './supabase'

type Rack     = Database['public']['Tables']['racks']['Row']
type Posicion = Database['public']['Tables']['posiciones_rack']['Row']
type Pasillo  = Database['public']['Tables']['pasillos']['Row']

export type RackConPosiciones = Rack & { posiciones: Posicion[] }
export type PasilloConRacks   = Pasillo & { racks: RackConPosiciones[] }

type Producto = Database['public']['Tables']['productos']['Row']
export type ProductoConEquivalentes = Producto & { equivalentes: Producto[] }

export type UbicacionProducto = {
  tipo: 'rack' | 'pasillo' | 'sin_ubicacion' | 'sin_stock'
  label: string
}
export type ProductoConUbicacion = Producto & { ubicacion: UbicacionProducto }
