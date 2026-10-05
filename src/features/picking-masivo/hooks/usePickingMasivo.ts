import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pickingMasivoApi } from '../services/picking-masivo.api'

export function useSesionesPicking(estado?: string) {
  return useQuery({
    queryKey:  ['picking-masivo', 'sesiones', estado],
    queryFn:   () => pickingMasivoApi.listarSesiones(estado),
    staleTime: 0,
  })
}

export function useSesionPicking(id: string | null) {
  return useQuery({
    queryKey:  ['picking-masivo', 'sesion', id],
    queryFn:   () => pickingMasivoApi.obtenerSesion(id!),
    enabled:   !!id,
    staleTime: 0,
  })
}

export function useColaSubtareas(sesionId: string | null) {
  return useQuery({
    queryKey:       ['picking-masivo', 'cola', sesionId],
    queryFn:        () => pickingMasivoApi.colaSubtareas(sesionId!),
    enabled:        !!sesionId,
    staleTime:      0,
    refetchInterval: 2000,
  })
}

export function useValidarExcel() {
  return useMutation({ mutationFn: pickingMasivoApi.validarExcel })
}

export function useGuardarLpns() {
  return useMutation({ mutationFn: pickingMasivoApi.guardarLpns })
}

export function useGuardarLpnsEscaneados() {
  return useMutation({ mutationFn: pickingMasivoApi.guardarLpnsEscaneados })
}

export function useCrearSesion() {
  return useMutation({ mutationFn: pickingMasivoApi.crearSesion })
}

export function useActivarSesion() {
  return useMutation({ mutationFn: pickingMasivoApi.activarSesion })
}

export function useTomarSubtarea(sesionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pickingMasivoApi.tomarSubtarea,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picking-masivo', 'cola', sesionId] }),
  })
}

export function useConfirmarSubtarea(sesionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pickingMasivoApi.confirmarSubtarea,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['picking-masivo', 'cola', sesionId] })
      qc.invalidateQueries({ queryKey: ['picking-masivo', 'sesion', sesionId] })
    },
  })
}

export function useLiberarPropias(sesionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pickingMasivoApi.liberarPropias,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picking-masivo', 'cola', sesionId] }),
  })
}

export function useEditarParcial(sesionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pickingMasivoApi.editarParcial,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['picking-masivo', 'cola', sesionId] })
      qc.invalidateQueries({ queryKey: ['picking-masivo', 'sesion', sesionId] })
    },
  })
}

export function useBuscarLpn() {
  return useMutation({ mutationFn: pickingMasivoApi.buscarLpn })
}

export function useValidarLpn(sesionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pickingMasivoApi.validarLpn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picking-masivo', 'sesion', sesionId] }),
  })
}

export function useBuscarItem() {
  return useMutation({ mutationFn: pickingMasivoApi.buscarItem })
}

export function useValidarItem(sesionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pickingMasivoApi.validarItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picking-masivo', 'sesion', sesionId] }),
  })
}

export function useDespacharSesion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pickingMasivoApi.despacharSesion,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picking-masivo', 'sesiones'] }),
  })
}

export function useCancelarSesion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pickingMasivoApi.cancelarSesion,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picking-masivo', 'sesiones'] }),
  })
}

export function useParcharSkuProveedor(sesionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pickingMasivoApi.parcharSkuProveedor,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picking-masivo', 'sesion', sesionId] }),
  })
}
