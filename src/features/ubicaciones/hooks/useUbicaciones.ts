import { useQuery } from '@tanstack/react-query'
import { ubicacionesApi } from '../services/ubicaciones.api'
export type { PosicionLibre, PasilloMapa, RackMapa, PosicionMapa, LoteMapa } from '../services/ubicaciones.api'

// staleTime 10 min — ubicaciones cambian poco (ARQ caché)
const STALE = 10 * 60 * 1000

export function useMapaBodega() {
  return useQuery({
    queryKey: ['ubicaciones', 'mapa'],
    queryFn:  ubicacionesApi.getMapaBodega,
    staleTime: 5 * 60 * 1000,
  })
}

export function useEstructura() {
  return useQuery({
    queryKey: ['ubicaciones', 'estructura'],
    queryFn:  ubicacionesApi.getEstructura,
    staleTime: STALE,
  })
}

export function usePasillos() {
  return useQuery({
    queryKey: ['ubicaciones', 'pasillos'],
    queryFn:  ubicacionesApi.getPasillos,
    staleTime: STALE,
  })
}

export function useRacks(pasilloId: string | null) {
  return useQuery({
    queryKey: ['ubicaciones', 'racks', pasilloId],
    queryFn:  () => ubicacionesApi.getRacks(pasilloId!),
    enabled:  !!pasilloId,
    staleTime: STALE,
  })
}

export function usePosicionesLibres(rackId: string | null) {
  return useQuery({
    queryKey: ['ubicaciones', 'posiciones-libres', rackId],
    queryFn:  () => ubicacionesApi.getPosicionesLibres(rackId!),
    enabled:  !!rackId,
    staleTime: 0,
  })
}

export function useTodasPosicionesLibres() {
  return useQuery({
    queryKey: ['ubicaciones', 'posiciones-libres-todas'],
    queryFn:  ubicacionesApi.getTodasPosicionesLibres,
    staleTime: 0,
  })
}

export function useProductosPasillo(pasilloId: string | null) {
  return useQuery({
    queryKey: ['ubicaciones', 'productos-pasillo', pasilloId],
    queryFn:  () => ubicacionesApi.getProductosPasillo(pasilloId!),
    enabled:  !!pasilloId,
    staleTime: 0,
  })
}

export function useProductosPosiciones(pasilloId: string | null) {
  return useQuery({
    queryKey: ['ubicaciones', 'productos-posiciones', pasilloId],
    queryFn:  () => ubicacionesApi.getProductosPosiciones(pasilloId!),
    enabled:  !!pasilloId,
    staleTime: 0,
  })
}
