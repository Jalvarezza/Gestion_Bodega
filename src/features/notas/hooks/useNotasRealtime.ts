import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabaseClient'

// Refresca las NV apenas cambia cualquier nota (otro operador la toma, se completa, se libera…)
export function useNotasRealtime() {
  const qc = useQueryClient()

  useEffect(() => {
    const canal = supabase
      .channel('notas:lista')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notas_venta' }, () => {
        qc.invalidateQueries({ queryKey: ['notas'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [qc])
}
