import type { RackMapa, PosicionMapa } from '../hooks/useUbicaciones'
import { PosicionBtn } from './PosicionBtn'

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

export function RackDetalleModal({
  rack,
  onClose,
  onPosicion,
}: {
  rack:       RackMapa
  onClose:    () => void
  onPosicion: (p: PosicionMapa) => void
}) {
  // Agrupar posiciones por nivel, ordenadas de mayor a menor (N4 arriba, N1 abajo)
  const niveles = Array.from(
    rack.posiciones.reduce((map, pos) => {
      if (!map.has(pos.nivel)) map.set(pos.nivel, [])
      map.get(pos.nivel)!.push(pos)
      return map
    }, new Map<number, PosicionMapa[]>())
  ).sort(([a], [b]) => b - a) // descendente: N4 primero

  return (
    <div className="mapa-pos-overlay" onClick={onClose}>
      <div className="mapa-pos-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mapa-pos-modal-header">
          <span className="mapa-pos-modal-codigo">{rack.codigo}</span>
          <button className="mapa-pos-modal-cerrar" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="mapa-pos-modal-body">
          <div className="mapa-rack-niveles">
            {niveles.map(([nivel, posiciones]) => (
              <div key={nivel} className="mapa-rack-fila">
                <span className="mapa-rack-nivel-label">N{nivel}</span>
                <div className="mapa-rack-posiciones">
                  {posiciones
                    .slice()
                    .sort((a, b) => a.posicion.localeCompare(b.posicion))
                    .map((pos) => (
                      <PosicionBtn key={pos.id} pos={pos} onClick={() => onPosicion(pos)} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
