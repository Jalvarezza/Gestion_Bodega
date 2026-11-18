import { describe, it, expect } from 'vitest'
import { calcularPlan } from '../../src/features/picking-masivo/utils/planFifo'

const u = (posicionCodigo: string, cantidad: number, fechaIngreso: string) => ({ loteId: posicionCodigo, posicionCodigo, cantidad, fechaIngreso })

describe('Plan FIFO de extracción', () => {
  const ubicaciones = [u('A-R1-1-A', 30, '2026-10-01'), u('A-R1-2-A', 50, '2026-10-15'), u('B-R1-1-A', 100, '2026-11-01')]

  it('UP-FIFO-01 · si el primer lote alcanza, se saca todo de la ubicación más antigua', () => {
    const plan = calcularPlan(ubicaciones, 20)
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ posicionCodigo: 'A-R1-1-A', cantidadATomar: 20 })
  })

  it('UP-FIFO-02 · si no alcanza, reparte en orden de ingreso entre varios racks', () => {
    const plan = calcularPlan(ubicaciones, 100)
    expect(plan.map((p) => [p.posicionCodigo, p.cantidadATomar])).toEqual([
      ['A-R1-1-A', 30], ['A-R1-2-A', 50], ['B-R1-1-A', 20],
    ])
  })

  it('UP-FIFO-03 · nunca planifica más de lo que hay en cada ubicación ni más de lo pedido', () => {
    const plan = calcularPlan(ubicaciones, 1000)
    expect(plan.reduce((t, p) => t + p.cantidadATomar, 0)).toBe(180)
    for (const p of plan) expect(p.cantidadATomar).toBeLessThanOrEqual(p.cantidad)
  })

  it('UP-FIFO-04 · sin stock ubicado el plan queda vacío (la línea pasa a "sin stock")', () => {
    expect(calcularPlan([], 10)).toEqual([])
  })
})
