import { useEffect, useRef } from 'react'
import { apiClient } from '../utils/apiClient'
import type { UserRole } from '../types/base'
import type { Notificacion } from './useNotificacionesRealtime'

const STORAGE_KEY = 'notif_last_seen'
const POLL_MS     = 60_000

function guardarUltimaVisita() {
  try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()) } catch { /* noop */ }
}

function leerUltimaVisita(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

type NotifNota    = { id: string; numero_nota: string; estado: string }
type NotifSesion  = { id: string; numero_oc: string; nombre_cliente: string; estado: string }
type NotifData    = { notas: NotifNota[]; sesiones: NotifSesion[] }

async function fetchItems(rol: string, desde: string | null): Promise<NotifData> {
  const params = new URLSearchParams({ rol })
  if (desde != null) params.set('desde', desde)
  return apiClient.get<NotifData>(`/notificaciones?${params.toString()}`)
}

function labelSesion(s: NotifSesion) {
  return s.nombre_cliente ? `OC ${s.numero_oc} — ${s.nombre_cliente}` : `OC ${s.numero_oc}`
}

export function useNotificacionesAlIngreso(
  rol: UserRole | null,
  onNotificacion: (n: Notificacion) => void,
): { recheck: () => void } {
  const cbRef       = useRef(onNotificacion)
  cbRef.current     = onNotificacion
  const notifiedRef = useRef<Set<string>>(new Set())
  const inicialRef  = useRef(true)
  const checkRef    = useRef<() => void>(() => {})

  useEffect(() => {
    if (!rol) return

    inicialRef.current = true
    notifiedRef.current.clear()

    async function check() {
      const esInicial = inicialRef.current
      inicialRef.current = false

      const desde = (rol === 'operador' && !esInicial) ? leerUltimaVisita() : null

      try {
        const data = await fetchItems(rol as string, desde)
        const notas    = Array.isArray(data.notas)    ? data.notas    : []
        const sesiones = Array.isArray(data.sesiones) ? data.sesiones : []

        if (rol === 'operador') {
          for (const nota of notas) {
            if (!notifiedRef.current.has(nota.id)) {
              notifiedRef.current.add(nota.id)
              cbRef.current({
                tipo:    'nueva_nota',
                mensaje: `Se ha agregado la nota ${nota.numero_nota}`,
              })
            }
          }
          for (const sesion of sesiones) {
            if (!notifiedRef.current.has(sesion.id)) {
              notifiedRef.current.add(sesion.id)
              cbRef.current({
                tipo:    'nueva_nota',
                mensaje: `Se ha asignado sesión ${labelSesion(sesion)}`,
              })
            }
          }
          if (!esInicial) guardarUltimaVisita()
        }

        if (rol === 'supervisor') {
          for (const nota of notas) {
            if (!notifiedRef.current.has(nota.id)) {
              notifiedRef.current.add(nota.id)
              cbRef.current({
                tipo:    'nota_completa',
                mensaje: `La nota ${nota.numero_nota} está pendiente de revisión`,
              })
            }
          }
          for (const sesion of sesiones) {
            if (!notifiedRef.current.has(sesion.id)) {
              notifiedRef.current.add(sesion.id)
              cbRef.current({
                tipo:    'nota_completa',
                mensaje: `Sesión ${labelSesion(sesion)} pendiente de revisión`,
              })
            }
          }
        }

        if (rol === 'admin') {
          for (const nota of notas) {
            const key = `${nota.id}_${nota.estado}`
            if (!notifiedRef.current.has(key)) {
              notifiedRef.current.add(key)
              cbRef.current({
                tipo:    nota.estado === 'despachada' ? 'nota_completa' : 'nueva_nota',
                mensaje: nota.estado === 'despachada'
                  ? `Supervisor despachó la nota ${nota.numero_nota}`
                  : `Operador completó la nota ${nota.numero_nota}`,
              })
            }
          }
          for (const sesion of sesiones) {
            const key = `${sesion.id}_${sesion.estado}`
            if (!notifiedRef.current.has(key)) {
              notifiedRef.current.add(key)
              cbRef.current({
                tipo:    'nota_completa',
                mensaje: sesion.estado === 'completada'
                  ? `Operador completó sesión ${labelSesion(sesion)}`
                  : `Supervisor despachó sesión ${labelSesion(sesion)}`,
              })
            }
          }
        }
      } catch (err) {
        console.warn('[notif]', err)
      }
    }

    checkRef.current = check
    check()

    const timer = setInterval(check, POLL_MS)

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        guardarUltimaVisita()
      } else {
        check()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      guardarUltimaVisita()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [rol])

  return { recheck: () => checkRef.current() }
}
