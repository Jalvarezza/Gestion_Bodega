// @ts-nocheck
// Fase 1 — Extracción consolidada por operador
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'

export const olasExtraccionService = {

  // ── Cola de tareas libres para el operador ────────────────────────────────
  async colaTareas(olaId: string): Promise<ServiceResult<unknown[]>> {
    // Liberar tareas expiradas (>10 min sin confirmar)
    await supabase
      .from('ola_tareas_extraccion')
      .update({ estado: 'libre', bloqueado_por: null, bloqueado_en: null })
      .eq('ola_id', olaId)
      .eq('estado', 'bloqueado')
      .lt('bloqueado_en', new Date(Date.now() - 10 * 60 * 1000).toISOString())

    const { data, error } = await supabase
      .from('ola_tareas_extraccion')
      .select('id, descripcion, codigo_barra, cantidad_total, cantidad_extraida, estado, ruta_sugerida, bloqueado_por, bloqueado_en, completado_por, completado_en')
      .eq('ola_id', olaId)
      .in('estado', ['libre', 'bloqueado', 'completado'])
      .order('descripcion', { ascending: true })

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const ids = [...new Set((data ?? [])
      .flatMap(t => [t.completado_por, t.bloqueado_por])
      .filter(Boolean)
    )]
    let nombresMap: Record<string, string> = {}
    if (ids.length > 0) {
      const { data: usuarios } = await supabase.from('usuarios').select('id, nombre').in('id', ids)
      for (const u of usuarios ?? []) nombresMap[u.id] = u.nombre
    }
    const result = (data ?? []).map(t => ({
      ...t,
      completado_por_nombre: t.completado_por ? (nombresMap[t.completado_por] ?? null) : null,
      bloqueado_por_nombre:  t.bloqueado_por  ? (nombresMap[t.bloqueado_por]  ?? null) : null,
    }))
    return { ok: true, data: result }
  },

  // ── Tomar tarea (bloqueo optimista) ───────────────────────────────────────
  async tomarTarea(tareaId: string, usuarioId: string): Promise<ServiceResult<{ tareaId: string }>> {
    const { data: updated, error } = await supabase
      .from('ola_tareas_extraccion')
      .update({
        estado:        'bloqueado',
        bloqueado_por: usuarioId,
        bloqueado_en:  new Date().toISOString(),
      })
      .eq('id', tareaId)
      .eq('estado', 'libre')
      .select('id')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    if (!updated || updated.length === 0) {
      return { ok: false, error: { code: 'CONFLICT', message: 'La tarea ya fue tomada por otro operador' } }
    }

    return { ok: true, data: { tareaId } }
  },

  // ── Confirmar extracción ──────────────────────────────────────────────────
  // El operador confirma el total extraído. El sistema descuenta lotes FIFO
  // automáticamente (el operador no indica posición).
  async confirmarExtraccion(
    tareaId:          string,
    usuarioId:        string,
    cantidadExtraida: number,
  ): Promise<ServiceResult<{ tareaId: string }>> {

    // Verificar que la tarea esté bloqueada por este usuario
    const { data: tarea, error: tareaErr } = await supabase
      .from('ola_tareas_extraccion')
      .select('id, ola_id, estado, bloqueado_por, producto_id, cantidad_total, ruta_sugerida')
      .eq('id', tareaId)
      .single()

    if (tareaErr || !tarea) return { ok: false, error: { code: 'NOT_FOUND', message: 'Tarea no encontrada' } }
    if (tarea.estado !== 'bloqueado') return { ok: false, error: { code: 'INVALID_STATE', message: 'La tarea no está bloqueada' } }
    if (tarea.bloqueado_por !== usuarioId) return { ok: false, error: { code: 'UNAUTHORIZED', message: 'No tienes esta tarea bloqueada' } }
    if (cantidadExtraida < 0 || cantidadExtraida > tarea.cantidad_total) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Cantidad inválida' } }
    }

    const lotesDescontados: { lote_id: string; posicion_codigo: string; cantidad: number }[] = []

    // Descontar lotes en orden FIFO usando la ruta_sugerida calculada al activar
    if (cantidadExtraida > 0 && tarea.producto_id) {
      const ruta: { posicion_codigo: string; lote_id: string; cantidad: number }[] =
        (tarea.ruta_sugerida as any) ?? []

      let restante = cantidadExtraida

      for (const tramo of ruta) {
        if (restante <= 0) break
        const aDescontar = Math.min(tramo.cantidad, restante)

        // Descuento atómico vía RPC (misma función que usa Sodimac)
        const { data: result, error: errLote } = await supabase
          .rpc('descontar_lote', { p_lote_id: tramo.lote_id, p_cantidad: aDescontar })

        if (errLote || !result?.ok) {
          // Si el lote ya no tiene suficiente (race condition), continuar con el siguiente
          // El supervisor verá la diferencia en Fase 3
          continue
        }

        lotesDescontados.push({ lote_id: tramo.lote_id, posicion_codigo: tramo.posicion_codigo, cantidad: aDescontar })
        restante -= aDescontar
      }
    }

    // Actualizar tarea
    const { error: updErr } = await supabase
      .from('ola_tareas_extraccion')
      .update({
        estado:            'completado',
        cantidad_extraida: cantidadExtraida,
        completado_por:    usuarioId,
        completado_en:     new Date().toISOString(),
        lotes_descontados: lotesDescontados.length > 0 ? lotesDescontados : null,
      })
      .eq('id', tareaId)

    if (updErr) return { ok: false, error: { code: 'DB_ERROR', message: updErr.message } }

    // El trigger fn_avanzar_ola_desde_extraccion avanza la ola automáticamente
    // cuando todas las tareas están completadas → estado: 'en_preparacion'

    return { ok: true, data: { tareaId } }
  },

  // ── Liberar tarea propia (operador sale de la sesión) ─────────────────────
  async liberarPropias(olaId: string, usuarioId: string): Promise<ServiceResult<{ liberadas: number }>> {
    const { data, error } = await supabase
      .from('ola_tareas_extraccion')
      .update({ estado: 'libre', bloqueado_por: null, bloqueado_en: null })
      .eq('ola_id', olaId)
      .eq('bloqueado_por', usuarioId)
      .eq('estado', 'bloqueado')
      .select('id')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: { liberadas: data?.length ?? 0 } }
  },
}
