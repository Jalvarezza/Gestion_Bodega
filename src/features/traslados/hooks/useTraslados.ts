import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { trasladosApi } from '../services/traslados.api'

export function useRacksDisponibles() {
  return useQuery({
    queryKey:  ['traslados', 'racks'],
    queryFn:   trasladosApi.getRacksDisponibles,
    staleTime: 0,
  })
}

export function useIniciarReubicacion() {
  return useMutation({ mutationFn: trasladosApi.iniciarReubicacion })
}

export function useConfirmarReubicacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: trasladosApi.confirmarReubicacion,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traslados'] }),
  })
}

export function useIniciarIntercambio() {
  return useMutation({ mutationFn: trasladosApi.iniciarIntercambio })
}

export function useSeleccionarDestino() {
  return useMutation({ mutationFn: trasladosApi.seleccionarDestino })
}

export function useConfirmarIntercambio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: trasladosApi.confirmarIntercambio,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traslados'] }),
  })
}
