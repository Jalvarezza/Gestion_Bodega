import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notasApi } from '../services/notas.api'

export function useNotas(estado?: string) {
  return useQuery({
    queryKey:  ['notas', 'lista', estado],
    queryFn:   () => notasApi.getNotas(estado),
    staleTime: 60 * 1000,
  })
}

export function useDetalleNota(id: string | null, usuarioId?: string) {
  return useQuery({
    queryKey: ['notas', 'detalle', id],
    queryFn:  () => notasApi.getDetalle(id!, usuarioId),
    enabled:  !!id,
    staleTime: 0,
  })
}

export function useRegistrarPicking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notasApi.registrarPicking,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas'] })
      qc.invalidateQueries({ queryKey: ['ubicaciones'], exact: false })
      // Puede completar la nota y hacerla aparecer en la lista de despacho
      qc.invalidateQueries({ queryKey: ['salidas'] })
    },
  })
}

export function useRegistrarSinStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notasApi.registrarSinStock,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas'] })
      qc.invalidateQueries({ queryKey: ['salidas'] })
    },
  })
}

export function useConcluirParcial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notasApi.concluirParcial,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas'] })
      qc.invalidateQueries({ queryKey: ['salidas'] })
    },
  })
}

export function useEnviarARevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notasApi.enviarARevision,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas'] })
      qc.invalidateQueries({ queryKey: ['salidas'] })
    },
  })
}

export function useCambiarEstadoNota() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notasApi.cambiarEstado,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas'] })
      // Al pasar a despachada, la nota debe salir de la lista "NV para despacho"
      qc.invalidateQueries({ queryKey: ['salidas'] })
    },
  })
}

export function useEditarNota() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notasApi.editarNota,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas'] })
    },
  })
}

export function useEliminarNota() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notasApi.eliminarNota,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas'] })
    },
  })
}

export function useAnularNota() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notasApi.anularNota,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas'] })
      qc.invalidateQueries({ queryKey: ['salidas'] })
    },
  })
}
