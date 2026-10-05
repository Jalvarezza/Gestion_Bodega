import { useState } from 'react'
import type { PasilloMapa, RackMapa } from '../hooks/useUbicaciones'
import { RACKS_LAYOUT, PASILLOS_LAYOUT, FRANJAS_PASILLO, BODEGA_VIEWBOX, LIMITE_PASILLOS_CHICOS, LIMITE_PASILLOS_CHICOS_TOPE, ZONA_VACIA_CHICA, MAPA_CONTENIDO } from '../config/racksLayout'

type EstadoFiltro = 'ninguno' | 'disponibles' | 'busqueda'

function pctOcupacion(rack: RackMapa): number {
  const total = rack.posiciones.length
  if (total === 0) return 0
  const ocupadas = rack.posiciones.filter((p) => p.ocupada).length
  return Math.round((ocupadas / total) * 100)
}

function rackTieneDisponible(rack: RackMapa): boolean {
  return rack.posiciones.some((p) => !p.ocupada)
}

function rackTieneCodigo(rack: RackMapa, codigo: string): boolean {
  const q = codigo.trim().toLowerCase()
  if (!q) return false
  return rack.posiciones.some((p) => p.ocupada && p.lote?.sku.toLowerCase() === q)
}

const COLOR_RACK = '#e8dcc0'       // beige claro, estado normal
const COLOR_RESALTADO = '#4ade80'  // verde, disponible / coincide la búsqueda

function FlechaPasillo({ x, y }: { x: number; y: number }) {
  return <polygon points={`${x - 7},${y} ${x + 7},${y} ${x},${y + 10}`} className="mapa-svg-flecha" />
}

export function MapaGeneral({
  pasillos,
  onSelectRack,
}: {
  pasillos:     PasilloMapa[]
  onSelectRack: (r: RackMapa) => void
}) {
  const [estado, setEstado] = useState<EstadoFiltro>('ninguno')
  const [codigo, setCodigo] = useState('')

  function alternarEstado(nuevo: EstadoFiltro) {
    setEstado((actual) => (actual === nuevo ? 'ninguno' : nuevo))
  }

  function colorDelRack(rack: RackMapa): string {
    if (estado === 'disponibles' && rackTieneDisponible(rack)) return COLOR_RESALTADO
    if (estado === 'busqueda' && rackTieneCodigo(rack, codigo)) return COLOR_RESALTADO
    return COLOR_RACK
  }

  return (
    <>
      <h1 className="mapa-titulo">Mapa de Bodega</h1>
      <p className="mapa-subtitulo">Toca un rack para ver su detalle</p>

      <div className="mapa-filtro-estado">
        <button
          className={`mapa-filtro-btn ${estado === 'disponibles' ? 'mapa-filtro-btn--activo' : ''}`}
          onClick={() => alternarEstado('disponibles')}
        >
          Disponibles
        </button>
        <button
          className={`mapa-filtro-btn ${estado === 'busqueda' ? 'mapa-filtro-btn--activo' : ''}`}
          onClick={() => alternarEstado('busqueda')}
        >
          Búsqueda de producto
        </button>
        {estado === 'busqueda' && (
          <input
            type="text"
            className="mapa-filtro-input"
            placeholder="Código del producto (SKU)"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            autoFocus
          />
        )}
      </div>

      <div className="mapa-svg-wrap">
        <svg
          className="mapa-svg"
          viewBox={`0 0 ${BODEGA_VIEWBOX.width} ${BODEGA_VIEWBOX.height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Plano físico de la bodega"
        >
          <text
            x={MAPA_CONTENIDO.x + MAPA_CONTENIDO.width / 2}
            y={44}
            textAnchor="middle"
            className="mapa-svg-titulo"
          >
            Plano General Bodega
          </text>

          {Object.entries(FRANJAS_PASILLO).map(([codigoPasillo, franja]) => (
            <rect
              key={codigoPasillo}
              x={MAPA_CONTENIDO.x}
              y={franja.yStart}
              width={MAPA_CONTENIDO.width}
              height={franja.height}
              className="mapa-svg-franja-gris"
            />
          ))}

          <rect
            x={ZONA_VACIA_CHICA.x}
            y={ZONA_VACIA_CHICA.y}
            width={ZONA_VACIA_CHICA.width}
            height={ZONA_VACIA_CHICA.height}
            className="mapa-svg-zona-vacia"
          />

          <line
            x1={LIMITE_PASILLOS_CHICOS.x}
            y1={LIMITE_PASILLOS_CHICOS.y1}
            x2={LIMITE_PASILLOS_CHICOS.x}
            y2={LIMITE_PASILLOS_CHICOS.y2}
            className="mapa-svg-limite"
          />

          <line
            x1={LIMITE_PASILLOS_CHICOS_TOPE.x1}
            y1={LIMITE_PASILLOS_CHICOS_TOPE.y}
            x2={LIMITE_PASILLOS_CHICOS_TOPE.x2}
            y2={LIMITE_PASILLOS_CHICOS_TOPE.y}
            className="mapa-svg-limite"
          />

          <rect
            x={MAPA_CONTENIDO.x}
            y={MAPA_CONTENIDO.y}
            width={MAPA_CONTENIDO.width}
            height={MAPA_CONTENIDO.height}
            className="mapa-svg-borde"
          />

          {pasillos.map((pasillo) => {
            const layoutPasillo = PASILLOS_LAYOUT[pasillo.codigo]

            return (
              <g key={pasillo.id}>
                {layoutPasillo && (
                  <g className="mapa-svg-pasillo">
                    <text
                      x={layoutPasillo.labelX}
                      y={layoutPasillo.labelY}
                      textAnchor="middle"
                      className="mapa-svg-pasillo-label"
                    >
                      {`Pasillo ${pasillo.codigo}`}
                    </text>
                    <FlechaPasillo x={layoutPasillo.labelX} y={layoutPasillo.labelY + 10} />
                  </g>
                )}

                {pasillo.racks.map((rack) => {
                  const l = RACKS_LAYOUT[rack.codigo]
                  if (!l) return null

                  const pct = pctOcupacion(rack)
                  const [, rackNum] = rack.codigo.split('-')
                  const cx = l.x + l.width / 2
                  const cy = l.y + l.height / 2

                  return (
                    <g
                      key={rack.id}
                      className="mapa-svg-rack"
                      onClick={() => onSelectRack(rack)}
                    >
                      <rect
                        x={l.x}
                        y={l.y}
                        width={l.width}
                        height={l.height}
                        rx={2}
                        fill={colorDelRack(rack)}
                      />
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="mapa-svg-rack-label">
                        {rackNum}
                      </text>
                      <title>{`${rack.codigo} · ${pct}% ocupado`}</title>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>
    </>
  )
}
