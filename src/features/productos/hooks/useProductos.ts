import { useQuery } from '@tanstack/react-query'
import { productosApi } from '../services/productos.api'

export function useUbicacionesProducto(id: string | null) {
  return useQuery({
    queryKey:  ['productos', 'ubicaciones', id],
    queryFn:   () => productosApi.getUbicaciones(id!),
    enabled:   !!id,
    staleTime: 60 * 1000,
  })
}

const STALE = 5 * 60 * 1000 // 5 min — catálogo de productos

export function useProductos() {
  return useQuery({
    queryKey:  ['productos'],
    queryFn:   productosApi.getAll,
    staleTime: STALE,
  })
}

export function useProductoPorCodigo(codigoBarra: string | null) {
  return useQuery({
    queryKey:  ['productos', 'codigo', codigoBarra],
    queryFn:   () => productosApi.getByCodigoBarra(codigoBarra!),
    enabled:   !!codigoBarra,
    staleTime: STALE,
  })
}

export function useBuscarProductos(q: string) {
  return useQuery({
    queryKey:  ['productos', 'buscar', q],
    queryFn:   () => productosApi.buscar(q),
    enabled:   q.length >= 2,
    staleTime: STALE,
  })
}
