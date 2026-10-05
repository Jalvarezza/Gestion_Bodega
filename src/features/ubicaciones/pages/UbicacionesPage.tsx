import { useState } from 'react'
import { useMapaBodega } from '../hooks/useUbicaciones'
import { useConectividad } from '../../../shared/hooks/useConectividad'
import { MapaGeneral }       from '../components/MapaGeneral'
import { PosicionModal }     from '../components/PosicionModal'
import { RackDetalleModal }  from '../components/RackDetalleModal'
import type { PosicionMapa, RackMapa } from '../hooks/useUbicaciones'

export function UbicacionesPage() {
  const { offline }                              = useConectividad()
  const { data: pasillos, isLoading, isError }   = useMapaBodega()

  const [posicionSeleccionada, setPosicionSeleccionada] = useState<PosicionMapa | null>(null)
  const [rackSeleccionado,     setRackSeleccionado]     = useState<RackMapa | null>(null)

  if (isLoading) {
    return (
      <div className="mapa-page">
        <div className="mapa-cargando">
          <span className="spinner" />
          <span>Cargando mapa de bodega…</span>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mapa-page">
        <p className="error">Error al cargar la bodega. Revisa tu conexión.</p>
      </div>
    )
  }

  const lista = pasillos ?? []

  return (
    <div className="mapa-page">
      {offline && <div className="aviso-offline">Sin conexión — datos en caché</div>}

      <MapaGeneral
        pasillos={lista}
        onSelectRack={(r) => setRackSeleccionado(r)}
      />

      {rackSeleccionado && (
        <RackDetalleModal
          rack={rackSeleccionado}
          onClose={() => setRackSeleccionado(null)}
          onPosicion={(pos) => setPosicionSeleccionada(pos)}
        />
      )}

      {posicionSeleccionada && (
        <PosicionModal
          posicion={posicionSeleccionada}
          onClose={() => setPosicionSeleccionada(null)}
        />
      )}
    </div>
  )
}
