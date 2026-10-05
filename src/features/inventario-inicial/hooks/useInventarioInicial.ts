import { useMutation, useQueryClient } from '@tanstack/react-query'
import { inventarioInicialApi }        from '../services/inventarioInicial.api'

export function useResolverPosicion() {
  return useMutation({ mutationFn: inventarioInicialApi.resolverPosicion })
}

export function useResolverProducto() {
  return useMutation({ mutationFn: inventarioInicialApi.resolverProducto })
}

export function useRegistrarLoteInicial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: inventarioInicialApi.registrarLote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ubicaciones'], exact: false })
      qc.invalidateQueries({ queryKey: ['productos'],   exact: false })
    },
  })
}

export function useBuscarLotePorPosicion() {
  return useMutation({ mutationFn: inventarioInicialApi.buscarLotePorPosicion })
}

export function useEliminarLoteInicial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: inventarioInicialApi.eliminarLote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ubicaciones'], exact: false })
    },
  })
}
