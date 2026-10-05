import { useQuery } from '@tanstack/react-query'
import { ubicacionesApi } from '../../ubicaciones/services/ubicaciones.api'

export function useTodasPosiciones() {
  return useQuery({
    queryKey: ['etiquetas-posiciones'],
    queryFn:  () => ubicacionesApi.getTodasPosiciones(),
    staleTime: 5 * 60 * 1000,
  })
}
