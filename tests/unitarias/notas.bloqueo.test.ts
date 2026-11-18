import { describe, it, expect, vi, beforeEach } from 'vitest'
import { crearSupabaseFalso, type Consulta } from '../helpers/supabaseFalso'

const falso = vi.hoisted(() => ({ ref: null as ReturnType<typeof crearSupabaseFalso> | null }))
vi.mock('../../api/lib/supabase/client', async () => {
  const { crearSupabaseFalso } = await import('../helpers/supabaseFalso')
  falso.ref = crearSupabaseFalso()
  return { supabase: falso.ref.cliente }
})

const { notasService } = await import('../../api/notas/notas.service')
const db = () => falso.ref!

const OP_A = '11111111-1111-4111-8111-111111111111'
const OP_B = '22222222-2222-4222-8222-222222222222'
const NOTA = '44444444-4444-4444-8444-444444444444'

type Escenario = { rol?: string; estado?: string; tomadaPor?: string | null; tomador?: string; rpc?: boolean; estadoTrasRpc?: string }

function escenario(e: Escenario) {
  let lecturas = 0
  db().responder((c: Consulta) => {
    if (c.tabla === 'usuarios') return { data: { rol: e.rol ?? 'operador' } }
    if (c.tabla === 'tomar_nota') return { data: e.rpc ?? true }
    if (c.tabla === 'notas_venta' && c.op === 'select') {
      lecturas++
      const tomada = lecturas > 1 && e.rpc === false
      return {
        data: {
          id: NOTA, numero_nota: '1001', nombre_cliente: 'Cliente',
          estado:     tomada ? (e.estadoTrasRpc ?? 'preparacion') : (e.estado ?? 'pendiente'),
          tomada_por: tomada ? OP_A : (e.tomadaPor ?? null),
          tomador:    { nombre: e.tomador ?? 'Operador A' },
        },
      }
    }
    return { data: null }
  })
}

beforeEach(() => db().reiniciar())

describe('NV Preparación · tomar una nota (bloqueo por nota)', () => {
  it('UP-NV-01 · un operador toma una nota pendiente mediante la RPC atómica tomar_nota', async () => {
    escenario({})
    const r = await notasService.tomarNota({ usuarioId: OP_A, notaId: NOTA })
    expect(r).toEqual({ ok: true, data: { notaId: NOTA } })
    const rpc = db().consultas.find((c) => c.op === 'rpc')!
    expect(rpc.tabla).toBe('tomar_nota')
    expect(rpc.valores).toEqual({ p_nota_id: NOTA, p_usuario_id: OP_A })
  })

  it('UP-NV-02 · si la nota ya está en preparación por otro operador se rechaza con NOTA_TOMADA', async () => {
    escenario({ estado: 'preparacion', tomadaPor: OP_A, tomador: 'Jose' })
    const r = await notasService.tomarNota({ usuarioId: OP_B, notaId: NOTA })
    expect(r.ok === false && r.error.code).toBe('NOTA_TOMADA')
    expect(r.ok === false && r.error.message).toContain('Jose')
    expect(db().consultas.some((c) => c.op === 'rpc' || c.op === 'update')).toBe(false)
  })

  it('UP-NV-03 · si dos operadores compiten y la RPC devuelve false, el perdedor recibe NOTA_TOMADA', async () => {
    escenario({ rpc: false, tomador: 'Jose' })
    const r = await notasService.tomarNota({ usuarioId: OP_B, notaId: NOTA })
    expect(r.ok === false && r.error.code).toBe('NOTA_TOMADA')
    expect(r.ok === false && r.error.message).toContain('Jose')
    expect(db().consultas.some((c) => c.tabla === 'movimientos')).toBe(false)
  })

  it('UP-NV-04 · el mismo operador puede retomar su nota sin volver a bloquearla', async () => {
    escenario({ estado: 'preparacion', tomadaPor: OP_A })
    const r = await notasService.tomarNota({ usuarioId: OP_A, notaId: NOTA })
    expect(r.ok).toBe(true)
    expect(db().consultas.some((c) => c.op === 'rpc')).toBe(false)
  })

  it('UP-NV-05 · solo el rol operador puede tomar notas', async () => {
    for (const rol of ['admin', 'supervisor', 'validador']) {
      escenario({ rol })
      const r = await notasService.tomarNota({ usuarioId: OP_A, notaId: NOTA })
      expect(r.ok === false && r.error.code).toBe('UNAUTHORIZED')
      db().reiniciar()
    }
  })

  it('UP-NV-06 · una nota completa o despachada no se puede tomar', async () => {
    for (const estado of ['completa', 'despachada', 'anulada']) {
      escenario({ estado })
      const r = await notasService.tomarNota({ usuarioId: OP_A, notaId: NOTA })
      expect(r.ok === false && r.error.code).toBe('CONFLICT_ESTADO_INVALIDO')
      db().reiniciar()
    }
  })
})
