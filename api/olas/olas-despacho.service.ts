// @ts-nocheck
// Fase 3 — Verificación y despacho: supervisor escanea LPN y confirma salida
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'

export const olasDespachoService = {

  // ── Escanear LPN (Fase 3 — supervisor) ───────────────────────────────────
  // Valida que el LPN fue escaneado en Fase 2 antes de permitir el despacho.
  // Marca todas las líneas del LPN como validadas para despacho.
  async escanearLpnFase3(
    olaId:       string,
    lpn:         string,
    supervisorId: string,
  ): Promise<ServiceResult<{ lineasValidadas: number; lpn: string }>> {

    const { data: ola, error: olaErr } = await supabase
      .from('olas_picking')
      .select('estado')
      .eq('id', olaId)
      .single()

    if (olaErr || !ola) return { ok: false, error: { code: 'NOT_FOUND', message: 'Ola no encontrada' } }
    if (ola.estado !== 'completada') {
      return { ok: false, error: { code: 'INVALID_STATE', message: `La ola está en estado '${ola.estado}'. Debe estar completada para iniciar despacho` } }
    }

    const { data: lineas, error: lineasErr } = await supabase
      .from('ola_lineas')
      .select('id, fase2_escaneado, fase3_validado')
      .eq('ola_id', olaId)
      .eq('lpn', lpn)

    if (lineasErr) return { ok: false, error: { code: 'DB_ERROR', message: lineasErr.message } }
    if (!lineas || lineas.length === 0) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `LPN ${lpn} no encontrado en esta ola` } }
    }

    // Verificar que todas las líneas del LPN pasaron Fase 2
    const sinFase2 = lineas.filter(l => !l.fase2_escaneado)
    if (sinFase2.length > 0) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: `LPN ${lpn} no completó la asignación en zona de preparación (Fase 2)` } }
    }

    const yaValidadas = lineas.filter(l => l.fase3_validado)
    if (yaValidadas.length === lineas.length) {
      return { ok: false, error: { code: 'CONFLICT', message: `LPN ${lpn} ya fue validado para despacho` } }
    }

    const ahora = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('ola_lineas')
      .update({ fase3_validado: true, fase3_por: supervisorId, fase3_en: ahora })
      .eq('ola_id', olaId)
      .eq('lpn', lpn)
      .eq('fase3_validado', false)

    if (updErr) return { ok: false, error: { code: 'DB_ERROR', message: updErr.message } }

    return { ok: true, data: { lineasValidadas: lineas.length - yaValidadas.length, lpn } }
  },

  // ── Despachar ola ─────────────────────────────────────────────────────────
  // Solo procede si el 100% de líneas tienen fase3_validado = true.
  async despacharOla(
    olaId:        string,
    supervisorId: string,
    nombreChofer: string,
  ): Promise<ServiceResult<{ olaId: string }>> {

    const { data: ola, error: olaErr } = await supabase
      .from('olas_picking')
      .select('estado, total_lineas')
      .eq('id', olaId)
      .single()

    if (olaErr || !ola) return { ok: false, error: { code: 'NOT_FOUND', message: 'Ola no encontrada' } }
    if (ola.estado !== 'completada') {
      return { ok: false, error: { code: 'INVALID_STATE', message: 'La ola debe estar completada para despachar' } }
    }
    if (!nombreChofer.trim()) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'El nombre del chofer es obligatorio' } }
    }

    // Verificar que todas las líneas estén validadas en Fase 3
    const { count: pendientes } = await supabase
      .from('ola_lineas')
      .select('id', { count: 'exact', head: true })
      .eq('ola_id', olaId)
      .eq('fase3_validado', false)

    if ((pendientes ?? 0) > 0) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: `Faltan ${pendientes} LPN(s) por validar en Fase 3` } }
    }

    const { error } = await supabase
      .from('olas_picking')
      .update({
        estado:        'despachada',
        nombre_chofer:  nombreChofer.trim(),
        despachado_en:  new Date().toISOString(),
        despachado_por: supervisorId,
      })
      .eq('id', olaId)

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: { olaId } }
  },

  // ── Líneas con estado Fase 3 ─────────────────────────────────────────────
  async lineasDespacho(olaId: string): Promise<ServiceResult<unknown[]>> {
    const { data, error } = await supabase
      .from('ola_lineas')
      .select(`
        id, lpn, tienda, descripcion, cantidad_solicitada,
        fase2_escaneado, fase3_validado, fase3_por, fase3_en,
        ola_ordenes ( numero_orden )
      `)
      .eq('ola_id', olaId)
      .order('lpn', { ascending: true })

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const ids = [...new Set((data ?? []).filter(l => l.fase3_por).map(l => l.fase3_por))]
    let nombresMap: Record<string, string> = {}
    if (ids.length > 0) {
      const { data: usuarios } = await supabase.from('usuarios').select('id, nombre').in('id', ids)
      for (const u of usuarios ?? []) nombresMap[u.id] = u.nombre
    }
    const result = (data ?? []).map(l => ({
      ...l,
      fase3_por_nombre: l.fase3_por ? (nombresMap[l.fase3_por] ?? null) : null,
    }))
    return { ok: true, data: result }
  },

  // ── Resumen de progreso Fase 3 ────────────────────────────────────────────
  async resumenDespacho(olaId: string): Promise<ServiceResult<{
    totalLineas:    number
    validadas:      number
    pendientes:     number
    porcentaje:     number
  }>> {
    const { data, error } = await supabase
      .from('ola_lineas')
      .select('fase3_validado')
      .eq('ola_id', olaId)

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const total    = data?.length ?? 0
    const validadas = (data ?? []).filter(l => l.fase3_validado).length

    return {
      ok: true,
      data: {
        totalLineas: total,
        validadas,
        pendientes:  total - validadas,
        porcentaje:  total > 0 ? Math.round((validadas / total) * 100) : 0,
      },
    }
  },
}
