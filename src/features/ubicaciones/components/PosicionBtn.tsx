import type { PosicionMapa } from '../hooks/useUbicaciones'

export function PosicionBtn({ pos, onClick }: { pos: PosicionMapa; onClick: () => void }) {
  const titulo = pos.ocupada && pos.lote
    ? `${pos.lote.nombre} · ${pos.lote.cantidad}`
    : pos.ocupada ? 'Ocupada' : 'Libre'

  return (
    <button
      className={`mapa-pos-btn${pos.ocupada ? ' mapa-pos-btn--ocupada' : ''}`}
      onClick={onClick}
      title={titulo}
    >
      <span className="mapa-pos-lado">{pos.posicion}</span>
      {!pos.ocupada && <span className="mapa-pos-libre-dot" />}
    </button>
  )
}
