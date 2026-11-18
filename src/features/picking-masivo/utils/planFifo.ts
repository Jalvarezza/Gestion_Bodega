import type { UbicacionPM } from '../services/pickingMasivo.api'

export type Parada = UbicacionPM & { cantidadATomar: number }

export function calcularPlan(ubicaciones: UbicacionPM[], necesario: number): Parada[] {
  const plan: Parada[] = []
  let restante = necesario
  for (const u of ubicaciones) {
    if (restante <= 0) break
    const tomar = Math.min(u.cantidad, restante)
    plan.push({ ...u, cantidadATomar: tomar })
    restante -= tomar
  }
  return plan
}
