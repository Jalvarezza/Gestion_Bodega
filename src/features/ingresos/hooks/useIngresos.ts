import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ingresosApi, type PosicionConProducto } from '../services/ingresos.api'

export function useImportaciones(estado?: string) {
  return useQuery({
    queryKey:  ['ingresos', 'lista', estado],
    queryFn:   () => ingresosApi.getImportaciones(estado),
    staleTime: 0,
  })
}

export function useDetalleImportacion(id: string | null) {
  return useQuery({
    queryKey: ['ingresos', 'detalle', id],
    queryFn:  () => ingresosApi.getDetalle(id!),
    enabled:  !!id,
    staleTime: 0,
  })
}

export function useAlmacenarEnRack(importacionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ingresosApi.almacenarEnRack,
    onSuccess: () => {
      qc.refetchQueries({ queryKey: ['ingresos', 'detalle', importacionId], exact: true, type: 'all' })
      qc.invalidateQueries({ queryKey: ['ingresos', 'lista'], exact: false })
      qc.invalidateQueries({ queryKey: ['ubicaciones'], exact: false })
    },
  })
}

export function usePosicionesConProducto(productoId: string) {
  return useQuery<PosicionConProducto[]>({
    queryKey:  ['ingresos', 'posiciones-con-producto', productoId],
    queryFn:   () => ingresosApi.getPosicionesConProducto(productoId),
    enabled:   !!productoId,
    staleTime: 30_000,
  })
}

export function useAlmacenarEnPasillo(importacionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ingresosApi.almacenarEnPasillo,
    onSuccess: () => {
      qc.refetchQueries({ queryKey: ['ingresos', 'detalle', importacionId], exact: true, type: 'all' })
      qc.invalidateQueries({ queryKey: ['ingresos', 'lista'], exact: false })
    },
  })
}

