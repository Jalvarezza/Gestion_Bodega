import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { salidasApi } from '../services/salidas.api'

export function useNotasParaRevision() {
  return useQuery({
    queryKey:  ['salidas', 'notas'],
    queryFn:   salidasApi.getNotasParaRevision,
    staleTime: 0,
  })
}

export function useValidarProducto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: salidasApi.validarProducto,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salidas'] })
      // El detalle de la nota (usado por RevisionFlow) vive en la caché de 'notas'
      qc.invalidateQueries({ queryKey: ['notas'] })
    },
  })
}
