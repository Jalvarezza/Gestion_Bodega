import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabaseClient'

export function useRealtimeSesiones() {
  const qc = useQueryClient()

  useEffect(() => {
    const canal = supabase
      .channel('picking-masivo:sesiones')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_picking_masivo' }, () => {
        qc.invalidateQueries({ queryKey: ['picking-masivo', 'sesiones'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [qc])
}

export function useRealtimeSesion(sesionId: string | null) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!sesionId) return

    const canal = supabase
      .channel(`picking-masivo:${sesionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'items_picking_masivo', filter: `sesion_id=eq.${sesionId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['picking-masivo', 'sesion', sesionId] })
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'subtareas_picking_masivo', filter: `sesion_id=eq.${sesionId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['picking-masivo', 'sesion', sesionId] })
        qc.refetchQueries({ queryKey: ['picking-masivo', 'cola', sesionId] })
      })
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [sesionId, qc])
}
