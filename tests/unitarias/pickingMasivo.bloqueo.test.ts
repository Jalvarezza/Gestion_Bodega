import { describe, it, expect, vi, beforeEach } from 'vitest'
import { crearSupabaseFalso, type Consulta } from '../helpers/supabaseFalso'

const falso = vi.hoisted(() => ({ ref: null as ReturnType<typeof crearSupabaseFalso> | null }))
vi.mock('../../api/lib/supabase/client', async () => {
  const { crearSupabaseFalso } = await import('../helpers/supabaseFalso')
  falso.ref = crearSupabaseFalso()
  return { supabase: falso.ref.cliente }
})

const { pickingMasivoService } = await import('../../api/picking-masivo/picking-masivo.service')
const db = () => falso.ref!

const OP_A = '11111111-1111-4111-8111-111111111111'
const OP_B = '22222222-2222-4222-8222-222222222222'
const ITEM = '33333333-3333-4333-8333-333333333333'

type Escenario = { rol?: string; estadoOrden?: string; filasActualizadas?: number; estadoActual?: string; tomador?: string }

function escenario(e: Escenario) {
  db().responder((c: Consulta) => {
    if (c.tabla === 'usuarios') return { data: { rol: e.rol ?? 'operador' } }
    if (c.tabla === 'items_picking_masivo' && c.op === 'update') {
      return { data: Array.from({ length: e.filasActualizadas ?? 1 }, () => ({ id: ITEM })) }
    }
    if (c.tabla === 'items_picking_masivo' && c.columnas?.includes('sesiones_picking_masivo')) {
      return { data: { sesiones_picking_masivo: { estado: e.estadoOrden ?? 'activa' } } }
    }
    if (c.tabla === 'items_picking_masivo' && c.columnas?.includes('tomador')) {
      return { data: { estado: e.estadoActual ?? 'en_progreso', tomador: { nombre: e.tomador ?? 'Operador A' } } }
    }
    return { data: null }
  })
}

beforeEach(() => db().reiniciar())

describe('Picking masivo · tomar un producto (bloqueo por línea)', () => {
  it('UP-PM-01 · un operador toma una línea libre', async () => {
    escenario({})
    const r = await pickingMasivoService.tomarLinea({ usuarioId: OP_A, itemId: ITEM })
    expect(r).toEqual({ ok: true, data: { itemId: ITEM } })
  })

  it('UP-PM-02 · el UPDATE de bloqueo solo afecta líneas libres o ya tomadas por el mismo operador', async () => {
    escenario({})
    await pickingMasivoService.tomarLinea({ usuarioId: OP_A, itemId: ITEM })
    const update = db().consultas.find((c) => c.op === 'update')!
    expect(update.valores).toMatchObject({ estado: 'en_progreso', tomado_por: OP_A })
    const condicion = update.filtros.find((f) => f[0] === 'or')?.[1]
    expect(condicion).toBe(`estado.eq.libre,and(estado.eq.en_progreso,tomado_por.eq.${OP_A})`)
  })

  it('UP-PM-03 · si otro operador ya la tomó, se rechaza con LINEA_TOMADA y su nombre', async () => {
    escenario({ filasActualizadas: 0, estadoActual: 'en_progreso', tomador: 'Jose' })
    const r = await pickingMasivoService.tomarLinea({ usuarioId: OP_B, itemId: ITEM })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error.code).toBe('LINEA_TOMADA')
    expect(r.ok === false && r.error.message).toContain('Jose')
  })

  it('UP-PM-04 · una línea ya resuelta no se puede tomar (LINEA_RESUELTA)', async () => {
    escenario({ filasActualizadas: 0, estadoActual: 'completado' })
    const r = await pickingMasivoService.tomarLinea({ usuarioId: OP_B, itemId: ITEM })
    expect(r.ok === false && r.error.code).toBe('LINEA_RESUELTA')
  })

  it('UP-PM-05 · solo el rol operador puede tomar líneas', async () => {
    for (const rol of ['admin', 'supervisor', 'validador']) {
      escenario({ rol })
      const r = await pickingMasivoService.tomarLinea({ usuarioId: OP_A, itemId: ITEM })
      expect(r.ok === false && r.error.code).toBe('UNAUTHORIZED')
      expect(db().consultas.some((c) => c.op === 'update')).toBe(false)
      db().reiniciar()
    }
  })

  it('UP-PM-06 · no se toman líneas de una orden cancelada o completada', async () => {
    for (const estadoOrden of ['cancelada', 'completada']) {
      escenario({ estadoOrden })
      const r = await pickingMasivoService.tomarLinea({ usuarioId: OP_A, itemId: ITEM })
      expect(r.ok === false && r.error.code).toBe('CONFLICT_ESTADO_INVALIDO')
      db().reiniciar()
    }
  })

  it('UP-PM-07 · liberar solo afecta la línea si la tiene tomada el mismo operador', async () => {
    escenario({})
    await pickingMasivoService.liberarLinea({ usuarioId: OP_B, itemId: ITEM })
    const update = db().consultas.find((c) => c.op === 'update')!
    expect(update.valores).toEqual({ estado: 'libre', tomado_por: null, tomado_en: null })
    expect(update.filtros).toContainEqual(['eq', 'tomado_por', OP_B])
    expect(update.filtros).toContainEqual(['eq', 'estado', 'en_progreso'])
  })
})

describe('Picking masivo · registrar picking (validaciones)', () => {
  const itemBase = {
    id: ITEM, estado: 'en_progreso', tomado_por: OP_A, cantidad_pedida: 10, cantidad_despachada: 0, producto_id: 'p1', codigo: 'SKU-1',
    productos: { id: 'p1', sku: 'SKU-1', nombre: 'Producto', codigo_barra: '0007801234', codigo_barra_alternativo: null },
    sesiones_picking_masivo: { id: 's1', numero_oc: '123', nombre_cliente: 'Cliente', estado: 'activa' },
  }
  const lote = { id: 'l1', producto_id: 'p1', cantidad: 50, fecha_ingreso: '2026-11-01', posiciones_rack: { codigo: 'A-R1-1-A' } }

  function escenarioPicking(item: Record<string, unknown>, lotes: unknown[] = [lote]) {
    db().responder((c) => {
      if (c.tabla === 'items_picking_masivo' && c.op === 'select') return { data: item }
      if (c.tabla === 'lotes_inventario') return { data: lotes }
      return { data: null }
    })
  }
  const base = { usuarioId: OP_A, itemId: ITEM, codigoRack: 'A-R1-1-A', codigoProducto: '7801234', cantidad: 5, comentario: null }

  it('UP-PM-08 · otro operador no puede registrar picking en una línea que no tomó (LINEA_NO_TOMADA)', async () => {
    escenarioPicking(itemBase)
    const r = await pickingMasivoService.registrarPicking({ ...base, usuarioId: OP_B })
    expect(r.ok === false && r.error.code).toBe('LINEA_NO_TOMADA')
    expect(db().consultas.some((c) => c.tabla === 'descontar_lote')).toBe(false)
  })

  it('UP-PM-09 · producto escaneado distinto se rechaza (INVALID_PRODUCTO)', async () => {
    escenarioPicking(itemBase)
    const r = await pickingMasivoService.registrarPicking({ ...base, codigoProducto: '999999' })
    expect(r.ok === false && r.error.code).toBe('INVALID_PRODUCTO')
  })

  it('UP-PM-10 · no se puede sacar más de lo solicitado (EXCEDE_SOLICITADO)', async () => {
    escenarioPicking(itemBase)
    const r = await pickingMasivoService.registrarPicking({ ...base, cantidad: 11 })
    expect(r.ok === false && r.error.code).toBe('EXCEDE_SOLICITADO')
  })

  it('UP-PM-11 · un picking parcial exige motivo (COMENTARIO_REQUERIDO)', async () => {
    escenarioPicking(itemBase)
    const r = await pickingMasivoService.registrarPicking({ ...base, cantidad: 4 })
    expect(r.ok === false && r.error.code).toBe('COMENTARIO_REQUERIDO')
  })

  it('UP-PM-12 · rack distinto al asignado se rechaza (UBICACION_INCORRECTA)', async () => {
    escenarioPicking(itemBase)
    const r = await pickingMasivoService.registrarPicking({ ...base, cantidad: 10, codigoRack: 'B-R2-1-A' })
    expect(r.ok === false && r.error.code).toBe('UBICACION_INCORRECTA')
  })

  it('UP-PM-13 · sin stock ubicado no se puede pickear (SIN_UBICACION)', async () => {
    escenarioPicking(itemBase, [])
    const r = await pickingMasivoService.registrarPicking({ ...base, cantidad: 10 })
    expect(r.ok === false && r.error.code).toBe('SIN_UBICACION')
  })

  it('UP-PM-14 · no se registra picking en una orden que ya no está activa', async () => {
    escenarioPicking({ ...itemBase, sesiones_picking_masivo: { ...itemBase.sesiones_picking_masivo, estado: 'cancelada' } })
    const r = await pickingMasivoService.registrarPicking({ ...base, cantidad: 10 })
    expect(r.ok === false && r.error.code).toBe('CONFLICT_ESTADO_INVALIDO')
  })
})
