import { useQuery } from '@tanstack/react-query'
import { historialApi } from '../services/historial.api'
import type { ObtenerMovimientosInput } from '../services/historial.api'

export function useListaOCs() {
  return useQuery({
    queryKey:  ['historial', 'ocs'],
    queryFn:   historialApi.getListaOCs,
    staleTime: 2 * 60 * 1000,
  })
}

export function useProductosPorOC(importacionId: string | null) {
  return useQuery({
    queryKey:  ['historial', 'oc-productos', importacionId],
    queryFn:   () => historialApi.getProductosPorOC(importacionId!),
    enabled:   !!importacionId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useMovimientosPorOCYProducto(importacionId: string | null, productoId: string | null) {
  return useQuery({
    queryKey:  ['historial', 'oc-producto', importacionId, productoId],
    queryFn:   () => historialApi.getMovimientosPorOCYProducto(importacionId!, productoId!),
    enabled:   !!importacionId && !!productoId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useMovimientos(filtros: ObtenerMovimientosInput | null) {
  return useQuery({
    queryKey:  ['historial', 'lista', filtros],
    queryFn:   () => historialApi.getMovimientos(filtros!),
    enabled:   filtros !== null,
    staleTime: 2 * 60 * 1000,
  })
}

export function useMovimientosPorIngreso(importacionId: string | null) {
  return useQuery({
    queryKey:  ['historial', 'ingreso', importacionId],
    queryFn:   () => historialApi.getMovimientosPorIngreso(importacionId!),
    enabled:   !!importacionId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useMovimientosPorNota(notaId: string | null) {
  return useQuery({
    queryKey:  ['historial', 'nota', notaId],
    queryFn:   () => historialApi.getMovimientosPorNota(notaId!),
    enabled:   !!notaId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useMovimientosPorTraslado(trasladoId: string | null) {
  return useQuery({
    queryKey:  ['historial', 'traslado', trasladoId],
    queryFn:   () => historialApi.getMovimientosPorTraslado(trasladoId!),
    enabled:   !!trasladoId,
    staleTime: 2 * 60 * 1000,
  })
}
