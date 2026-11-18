import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabaseClient'
import { pickingMasivoApi } from '../services/pickingMasivo.api'
import type { OrdenDetalle } from '../services/pickingMasivo.api'

const CLAVE = ['picking-masivo']

export function useOrdenesPicking() {
  return useQuery({ queryKey: [...CLAVE, 'lista'], queryFn: pickingMasivoApi.listar, staleTime: 30_000 })
}

export function useOrdenPicking(id: string) {
  return useQuery({ queryKey: [...CLAVE, 'orden', id], queryFn: () => pickingMasivoApi.obtener(id), enabled: !!id, staleTime: 0 })
}

function useMutacionPM<TIn, TOut>(fn: (body: TIn) => Promise<TOut>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: CLAVE })
      qc.invalidateQueries({ queryKey: ['ubicaciones'], exact: false })
    },
  })
}

export const useCrearOrden        = () => useMutacionPM(pickingMasivoApi.crear)
function useCambioLineaPM(fn: (body: { usuarioId: string; itemId: string }) => Promise<{ itemId: string }>, tomar: boolean) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, { usuarioId, itemId }) => {
      qc.setQueriesData<OrdenDetalle>({ queryKey: [...CLAVE, 'orden'] }, (orden) => orden && {
        ...orden,
        lineas: orden.lineas.map((l) => l.id !== itemId ? l : tomar
          ? { ...l, estado: 'en_progreso', tomadoPor: usuarioId }
          : { ...l, estado: 'libre', tomadoPor: null, tomadoPorNombre: null }),
      })
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: CLAVE }) },
  })
}

export const useTomarLinea        = () => useCambioLineaPM(pickingMasivoApi.tomarLinea, true)
export const useLiberarLinea      = () => useCambioLineaPM(pickingMasivoApi.liberarLinea, false)
export const useRegistrarPickingPM = () => useMutacionPM(pickingMasivoApi.registrarPicking)
export const useSinStockPM        = () => useMutacionPM(pickingMasivoApi.registrarSinStock)
export const useCancelarOrden     = () => useMutacionPM(pickingMasivoApi.cancelar)

// Refresca órdenes y líneas apenas otro operador toma, libera o completa una línea
export function usePickingMasivoRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const canal = supabase
      .channel('picking-masivo:cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items_picking_masivo' }, () => {
        qc.invalidateQueries({ queryKey: CLAVE })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_picking_masivo' }, () => {
        qc.invalidateQueries({ queryKey: CLAVE })
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [qc])
}
