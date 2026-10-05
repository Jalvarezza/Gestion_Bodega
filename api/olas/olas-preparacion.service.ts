// @ts-nocheck
// Fase 2 — Zona de preparación: operador escanea LPN para asignar a cada OC
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'

export type LineaLpn = {
  id:                 string
  lpn:                string
  tienda:             string | null
  descripcion:        string
  cantidadSolicitada: number
  fase2Escaneado:     boolean
  fase2En:            string | null
  numeroOrden:        string
  numeroGuia:         string | null
}

export const olasPreparacionService = {

  // ── Líneas pendientes de escaneo en Fase 2 ────────────────────────────────
  // Devuelve todas las líneas de la ola agrupadas por LPN.
  // Un LPN puede tener múltiples líneas (varios productos en la misma caja).
  async lineasPendientes(olaId: string): Promise<ServiceResult<unknown[]>> {
    const { data, error } = await supabase
      .from('ola_lineas')
      .select(`
        id, lpn, posicion_orden, codigo_barra, codigo_proveedor, sku_proveedor, descripcion,
        tienda, cantidad_solicitada, fase2_escaneado, fase2_por, fase2_en,
        ola_ordenes ( numero_orden, numero_guia )
      `)
      .eq('ola_id', olaId)
      .order('lpn', { ascending: true })

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const ids = [...new Set((data ?? []).filter(l => l.fase2_por).map(l => l.fase2_por))]
    let nombresMap: Record<string, string> = {}
    if (ids.length > 0) {
      const { data: usuarios } = await supabase.from('usuarios').select('id, nombre').in('id', ids)
      for (const u of usuarios ?? []) nombresMap[u.id] = u.nombre
    }
    const result = (data ?? []).map(l => ({
      ...l,
      fase2_por_nombre: l.fase2_por ? (nombresMap[l.fase2_por] ?? null) : null,
    }))
    return { ok: true, data: result }
  },

  // ── Escanear LPN (Fase 2) ─────────────────────────────────────────────────
  // Un solo escaneo marca TODAS las líneas que comparten ese LPN dentro de la ola.
  // (Un LPN puede contener múltiples productos — ver caso Construmart.)
  async escanearLpn(
    olaId:     string,
    lpn:       string,
    usuarioId: string,
  ): Promise<ServiceResult<{ lineasMarcadas: number; lpn: string }>> {

    // Verificar que la ola esté en fase de preparación
    const { data: ola, error: olaErr } = await supabase
      .from('olas_picking')
      .select('estado')
      .eq('id', olaId)
      .single()

    if (olaErr || !ola) return { ok: false, error: { code: 'NOT_FOUND', message: 'Ola no encontrada' } }
    if (ola.estado !== 'en_preparacion') {
      return { ok: false, error: { code: 'INVALID_STATE', message: `La ola está en estado '${ola.estado}', no en preparación` } }
    }

    // Buscar líneas con ese LPN en la ola
    const { data: lineas, error: lineasErr } = await supabase
      .from('ola_lineas')
      .select('id, fase2_escaneado')
      .eq('ola_id', olaId)
      .eq('lpn', lpn)

    if (lineasErr) return { ok: false, error: { code: 'DB_ERROR', message: lineasErr.message } }
    if (!lineas || lineas.length === 0) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `LPN ${lpn} no encontrado en esta ola` } }
    }

    const yaEscaneadas = lineas.filter(l => l.fase2_escaneado)
    if (yaEscaneadas.length === lineas.length) {
      return { ok: false, error: { code: 'CONFLICT', message: `LPN ${lpn} ya fue escaneado anteriormente` } }
    }

    // Marcar todas las líneas de este LPN
    const ahora = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('ola_lineas')
      .update({ fase2_escaneado: true, fase2_por: usuarioId, fase2_en: ahora })
      .eq('ola_id', olaId)
      .eq('lpn', lpn)
      .eq('fase2_escaneado', false)

    if (updErr) return { ok: false, error: { code: 'DB_ERROR', message: updErr.message } }

    // El trigger fn_avanzar_ola_desde_preparacion avanza la ola a 'completada'
    // cuando todas las líneas tienen fase2_escaneado = true

    return { ok: true, data: { lineasMarcadas: lineas.length - yaEscaneadas.length, lpn } }
  },
}
