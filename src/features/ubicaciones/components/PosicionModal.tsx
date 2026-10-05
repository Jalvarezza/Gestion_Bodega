import type { PosicionMapa } from '../hooks/useUbicaciones'

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function IconBox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={32} height={32}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  )
}

export function PosicionModal({
  posicion,
  onClose,
}: {
  posicion: PosicionMapa
  onClose:  () => void
}) {
  const label = `${posicion.nivel} · ${posicion.posicion}`

  return (
    <div className="mapa-pos-overlay" onClick={onClose}>
      <div className="mapa-pos-modal" onClick={(e) => e.stopPropagation()}>

        <div className="mapa-pos-modal-header">
          <div className="mapa-pos-modal-titulo">
            <span className="mapa-pos-modal-codigo">{posicion.codigo}</span>
            <span className="mapa-pos-modal-nivel">{label}</span>
          </div>
          <button className="mapa-pos-modal-cerrar" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        {posicion.ocupada ? (
          <div className="mapa-pos-modal-body mapa-pos-modal-body--ocupada">
            <div className="mapa-pos-modal-icono">
              <IconBox />
            </div>
            {posicion.lote ? (() => {
              return (
                <div className="mapa-pos-modal-filas">
                  <div className="mapa-pos-modal-fila">
                    <span className="mapa-pos-modal-etq">SKU:</span>
                    <span className="mapa-pos-modal-val">{posicion.lote.sku}</span>
                  </div>
                  <div className="mapa-pos-modal-fila">
                    <span className="mapa-pos-modal-etq">Producto:</span>
                    <span className="mapa-pos-modal-val mapa-pos-modal-val--nombre">{posicion.lote.nombre}</span>
                  </div>
                  <div className="mapa-pos-modal-fila">
                    <span className="mapa-pos-modal-etq">Cantidad:</span>
                    <span className="mapa-pos-modal-val mapa-pos-modal-val--qty">{posicion.lote.cantidad}</span>
                  </div>
                  <div className="mapa-pos-modal-fila">
                    <span className="mapa-pos-modal-etq">Ingreso:</span>
                    <span className="mapa-pos-modal-val">
                      {posicion.lote.fechaIngreso.slice(0, 10).split('-').reverse().join('-')}
                    </span>
                  </div>
                </div>
              )
            })() : (
              <p className="mapa-pos-libre-txt">Ocupada, sin datos de lote disponibles.</p>
            )}
          </div>
        ) : (
          <div className="mapa-pos-modal-body mapa-pos-modal-body--libre">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth={1.5} width={48} height={48} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <path d="M8 12h8M12 8v8"/>
            </svg>
            <p className="mapa-pos-libre-txt">Posición disponible</p>
            <p className="mapa-pos-libre-sub">{posicion.codigo}</p>
          </div>
        )}
      </div>
    </div>
  )
}
