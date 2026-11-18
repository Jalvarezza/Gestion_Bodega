import { describe, it, expect, vi } from 'vitest'

vi.mock('../../api/lib/supabase/client', async () => {
  const { crearSupabaseFalso } = await import('../helpers/supabaseFalso')
  return { supabase: crearSupabaseFalso().cliente }
})

const { default: handler } = await import('../../api/picking-masivo/index')

const UUID = '11111111-1111-4111-8111-111111111111'

async function llamar(method: string, accion: string, body: unknown) {
  let status = 0
  let json: any = null
  const res: any = {
    status: (s: number) => { status = s; return res },
    json:   (j: unknown) => { json = j; return res },
  }
  await handler({ method, query: { accion }, body } as any, res)
  return { status, json }
}

describe('API picking masivo · validación de entrada', () => {
  it('UP-API-01 · tomar-linea sin usuarioId responde 400 VALIDATION_ERROR', async () => {
    const r = await llamar('POST', 'tomar-linea', { itemId: UUID })
    expect(r.status).toBe(400)
    expect(r.json.error.code).toBe('VALIDATION_ERROR')
  })

  it('UP-API-02 · ids que no son UUID se rechazan', async () => {
    const r = await llamar('POST', 'tomar-linea', { usuarioId: 'abc', itemId: '123' })
    expect(r.status).toBe(400)
  })

  it('UP-API-03 · picking con cantidad 0 o negativa se rechaza', async () => {
    for (const cantidad of [0, -5]) {
      const r = await llamar('POST', 'picking', { usuarioId: UUID, itemId: UUID, codigoRack: 'A-R1-1-A', codigoProducto: '123', cantidad })
      expect(r.status).toBe(400)
    }
  })

  it('UP-API-04 · picking sin código de rack se rechaza', async () => {
    const r = await llamar('POST', 'picking', { usuarioId: UUID, itemId: UUID, codigoRack: '  ', codigoProducto: '123', cantidad: 1 })
    expect(r.status).toBe(400)
  })

  it('UP-API-05 · acción desconocida responde 400 ACCION_INVALIDA', async () => {
    const r = await llamar('POST', 'borrar-todo', {})
    expect(r.json.error.code).toBe('ACCION_INVALIDA')
  })

  it('UP-API-06 · métodos distintos de GET/POST responden 405', async () => {
    const r = await llamar('DELETE', 'tomar-linea', {})
    expect(r.status).toBe(405)
  })
})
