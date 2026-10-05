import { useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { UserRole } from '../types/base'

export type TipoNotif = 'nueva_nota' | 'nota_completa'

export interface Notificacion {
  tipo:    TipoNotif
  mensaje: string
}

function beep(freq: number, dur: number, vol = 0.22) {
  try {
    const ctx  = new AudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + dur)
  } catch { /* sin permiso de audio */ }
}

function sonarOperador() {
  beep(880, 0.2)
  setTimeout(() => beep(1047, 0.18), 200)
}

function sonarSupervisor() {
  beep(660, 0.18)
  setTimeout(() => beep(880, 0.22), 180)
}

export function useNotificacionesRealtime(
  rol: UserRole | null,
  onNotificacion: (n: Notificacion) => void,
) {
  const cbRef = useRef(onNotificacion)
  cbRef.current = onNotificacion

  useEffect(() => {
    if (!rol) return

    if (rol === 'operador') {
      const canal = supabase
        .channel('notif:operador:notas')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notas_venta' }, () => {
          sonarOperador()
          cbRef.current({ tipo: 'nueva_nota', mensaje: 'Se ha cargado una nueva nota' })
        })
        .subscribe((status, err) => {
          if (err) console.error('[Realtime operador] error:', err)
          else console.log('[Realtime operador] estado:', status)
        })
      return () => { supabase.removeChannel(canal) }
    }

    if (rol === 'supervisor' || rol === 'admin') {
      const canal = supabase
        .channel('notif:supervisor:notas')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notas_venta' }, (payload) => {
          if ((payload.new as { estado?: string })?.estado === 'completa') {
            sonarSupervisor()
            cbRef.current({ tipo: 'nota_completa', mensaje: 'Una nota ha sido completada y está lista para validación' })
          }
        })
        .subscribe((status, err) => {
          if (err) console.error('[Realtime supervisor] error:', err)
          else console.log('[Realtime supervisor] estado:', status)
        })
      return () => { supabase.removeChannel(canal) }
    }
  }, [rol])
}
