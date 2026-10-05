const POS_ALTO_CM  = 100
const POS_LARGO_CM = 120
const POS_ANCHO_CM = 100

export type DimensionesCaja = {
  alto_cm:  number
  largo_cm: number
  ancho_cm: number
}

export function calcularCapacidad(caja: DimensionesCaja): number {
  if (!caja.alto_cm || !caja.largo_cm || !caja.ancho_cm) return 0
  return (
    Math.floor(POS_ALTO_CM  / caja.alto_cm)  *
    Math.floor(POS_LARGO_CM / caja.largo_cm) *
    Math.floor(POS_ANCHO_CM / caja.ancho_cm)
  )
}

export type NivelOcupacion = 'libre' | 'parcial' | 'casi-llena' | 'llena'

export function nivelOcupacion(cantidad: number, capacidad: number): NivelOcupacion {
  if (capacidad === 0 || cantidad === 0) return 'libre'
  const pct = cantidad / capacidad
  if (pct >= 1)   return 'llena'
  if (pct >= 0.9) return 'casi-llena'
  return 'parcial'
}

export function pctOcupacion(cantidad: number, capacidad: number): number {
  if (capacidad === 0) return 0
  return Math.min(100, Math.round((cantidad / capacidad) * 100))
}

export type SugerenciaUbicacion =
  | { tipo: 'completar'; posicionId: string; codigo: string; stockActual: number; capacidadMax: number; cantidadSugerida: number }
  | { tipo: 'nueva';     cantidadSugerida: number }

export function sugerirDistribucion(
  cantidadTotal: number,
  posiciones: { posicionId: string; codigo: string; stockActual: number; capacidadMax: number }[],
): SugerenciaUbicacion[] {
  const sugerencias: SugerenciaUbicacion[] = []
  let restante = cantidadTotal

  // Primero completar posiciones existentes, de más llena a menos llena
  const conEspacio = posiciones
    .filter((p) => p.capacidadMax > p.stockActual)
    .sort((a, b) => (b.stockActual / b.capacidadMax) - (a.stockActual / a.capacidadMax))

  for (const pos of conEspacio) {
    if (restante <= 0) break
    const espacio = pos.capacidadMax - pos.stockActual
    const asignar = Math.min(espacio, restante)
    sugerencias.push({ tipo: 'completar', posicionId: pos.posicionId, codigo: pos.codigo, stockActual: pos.stockActual, capacidadMax: pos.capacidadMax, cantidadSugerida: asignar })
    restante -= asignar
  }

  if (restante > 0) {
    sugerencias.push({ tipo: 'nueva', cantidadSugerida: restante })
  }

  return sugerencias
}
