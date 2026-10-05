import { useState } from 'react'
import { ReubicacionFlow } from '../components/ReubicacionFlow'
import { IntercambioFlow } from '../components/IntercambioFlow'
import { useRacksDisponibles } from '../hooks/useTraslados'
import { useConectividad } from '../../../shared/hooks/useConectividad'
import type { PosicionDisponible } from '../services/traslados.api'

type Vista =
  | { tipo: 'menu' }
  | { tipo: 'reubicacion' }
  | { tipo: 'intercambio' }
  | { tipo: 'racks' }

function ListaRacks() {
  const { data, isLoading, isError } = useRacksDisponibles()

  if (isLoading) return <p className="cargando">Cargando racks…</p>
  if (isError)   return <p className="error">Error al cargar racks disponibles</p>

  return (
    <div className="racks-lista">
      <h3>Posiciones disponibles ({(data ?? []).length})</h3>
      {(data ?? []).length === 0
        ? <p className="vacio">No hay posiciones vacías</p>
        : (
          <div className="racks-tabla-wrap"><table className="tabla-racks">
            <thead>
              <tr>
                <th>Código</th>
                <th>Rack</th>
                <th>Pasillo</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((pos: PosicionDisponible) => (
                <tr key={pos.posicionId}>
                  <td><code>{pos.codigo}</code></td>
                  <td>{pos.rack}</td>
                  <td>{pos.pasillo}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )
      }
    </div>
  )
}

export function TrasladosPage() {
  const { offline } = useConectividad()
  const [vista, setVista] = useState<Vista>({ tipo: 'menu' })

  if (vista.tipo === 'reubicacion') {
    return <ReubicacionFlow offline={offline} onCerrar={() => setVista({ tipo: 'menu' })} />
  }

  if (vista.tipo === 'intercambio') {
    return <IntercambioFlow offline={offline} onCerrar={() => setVista({ tipo: 'menu' })} />
  }

  return (
    <div className="traslados-page">
      <h1>Traslados</h1>

      {offline && (
        <div className="aviso-offline">Sin conexión — las operaciones requieren WiFi.</div>
      )}

      {/* Regla 2: 3 botones en pantalla inicial */}
      {vista.tipo === 'menu' && (
        <div className="traslados-menu">
          <button
            className="btn-traslado"
            disabled={offline}
            onClick={() => setVista({ tipo: 'reubicacion' })}
          >
            <span className="btn-icono">→</span>
            <span className="btn-label">Re-ubicar</span>
            <span className="btn-desc">Mover un producto a otra posición vacía</span>
          </button>

          <button
            className="btn-traslado"
            disabled={offline}
            onClick={() => setVista({ tipo: 'intercambio' })}
          >
            <span className="btn-icono">⇄</span>
            <span className="btn-label">Intercambiar</span>
            <span className="btn-desc">Cambiar dos productos de posición entre sí</span>
          </button>

          <button
            className="btn-traslado btn-traslado-secundario"
            onClick={() => setVista({ tipo: 'racks' })}
          >
            <span className="btn-icono">☰</span>
            <span className="btn-label">Racks disponibles</span>
            <span className="btn-desc">Ver posiciones vacías en la bodega</span>
          </button>
        </div>
      )}

      {vista.tipo === 'racks' && (
        <div>
          <button className="btn-volver" onClick={() => setVista({ tipo: 'menu' })}>← Volver</button>
          <ListaRacks />
        </div>
      )}
    </div>
  )
}
