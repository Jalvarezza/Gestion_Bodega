import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { olasApi } from '../services/olas.api'

// ─── Gestión de olas ──────────────────────────────────────────────────────────

export function useOlas(estado?: string) {
  return useQuery({
    queryKey:  ['olas', estado],
    queryFn:   () => olasApi.listarOlas(estado),
    staleTime: 0,
  })
}

export function useOla(id: string | null) {
  return useQuery({
    queryKey: ['olas', 'detalle', id],
    queryFn:  () => olasApi.obtenerOla(id!),
    enabled:  !!id,
    staleTime: 0,
  })
}

export function useValidarArchivoOla() {
  return useMutation({ mutationFn: (skus: { codigoBarra: string; cantidadTotal: number }[]) => olasApi.validarArchivo(skus) })
}

export function useCrearOla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: olasApi.crearOla,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['olas'] }),
  })
}

export function useActivarOla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ olaId, usuarioId }: { olaId: string; usuarioId: string }) =>
      olasApi.activarOla(olaId, usuarioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['olas'] }),
  })
}

export function useCancelarOla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (olaId: string) => olasApi.cancelarOla(olaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['olas'] }),
  })
}

// ─── Fase 1 — Extracción ─────────────────────────────────────────────────────

export function useColaExtraccion(olaId: string | null) {
  return useQuery({
    queryKey:        ['olas', 'extraccion', olaId],
    queryFn:         () => olasApi.colaExtraccion(olaId!),
    enabled:         !!olaId,
    staleTime:       0,
    refetchInterval: 1500,
  })
}

export function useTomarTarea(olaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tareaId, usuarioId }: { tareaId: string; usuarioId: string }) =>
      olasApi.tomarTarea(tareaId, usuarioId),
    onSettled: () => qc.invalidateQueries({ queryKey: ['olas', 'extraccion', olaId] }),
  })
}

export function useConfirmarExtraccion(olaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tareaId, usuarioId, cantidadExtraida }: { tareaId: string; usuarioId: string; cantidadExtraida: number }) =>
      olasApi.confirmarExtraccion(tareaId, usuarioId, cantidadExtraida),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['olas', 'extraccion', olaId] }),
  })
}

export function useLiberarPropiasExtraccion() {
  return useMutation({
    mutationFn: ({ olaId, usuarioId }: { olaId: string; usuarioId: string }) =>
      olasApi.liberarPropiasExtraccion(olaId, usuarioId),
  })
}

// ─── Fase 2 — Preparación ─────────────────────────────────────────────────────

export function useLineasPreparacion(olaId: string | null) {
  return useQuery({
    queryKey:        ['olas', 'preparacion', olaId],
    queryFn:         () => olasApi.lineasPreparacion(olaId!),
    enabled:         !!olaId,
    staleTime:       0,
    refetchInterval: 3000,
  })
}

export function useEscanearLpnF2(olaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ lpn, usuarioId }: { lpn: string; usuarioId: string }) =>
      olasApi.escanearLpnF2(olaId, lpn, usuarioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['olas', 'preparacion', olaId] }),
  })
}

// ─── Fase 3 — Despacho ───────────────────────────────────────────────────────

export function useLineasDespacho(olaId: string | null) {
  return useQuery({
    queryKey:        ['olas', 'despacho-lineas', olaId],
    queryFn:         () => olasApi.lineasDespacho(olaId!),
    enabled:         !!olaId,
    staleTime:       0,
    refetchInterval: 4000,
  })
}

export function useResumenDespacho(olaId: string | null) {
  return useQuery({
    queryKey:        ['olas', 'despacho', olaId],
    queryFn:         () => olasApi.resumenDespacho(olaId!),
    enabled:         !!olaId,
    staleTime:       0,
    refetchInterval: 3000,
  })
}

export function useEscanearLpnF3(olaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ lpn, supervisorId }: { lpn: string; supervisorId: string }) =>
      olasApi.escanearLpnF3(olaId, lpn, supervisorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['olas', 'despacho', olaId] }),
  })
}

export function useDespacharOla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ olaId, supervisorId, nombreChofer }: { olaId: string; supervisorId: string; nombreChofer: string }) =>
      olasApi.despacharOla(olaId, supervisorId, nombreChofer),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['olas'] }),
  })
}
