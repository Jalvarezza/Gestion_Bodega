import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrdenesPicking, usePickingMasivoRealtime } from '../hooks/usePickingMasivo'
import { ImportarOCFlow } from '../components/ImportarOCFlow'
import { SubtituloModulo } from '../../../shared/components/SubtituloModulo'

type Filtro = 'todas' | 'activa' | 'completada'

const ETIQUETA_ESTADO: Record<string, string> = { activa: 'En proceso', completada: 'Completada', cancelada: 'Cancelada' }

const IcoOjo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
)

export function PickingMasivoPage() {
  const navigate  = useNavigate()
  const usuarioId = localStorage.getItem('user_id') ?? ''
  const rol       = localStorage.getItem('user_rol') ?? ''
  const puedeCargar = rol === 'admin' || rol === 'supervisor'

  const [importar, setImportar] = useState(false)
  const [filtro, setFiltro]     = useState<Filtro>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [dia, setDia]           = useState('')
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const { data: ordenes = [], isLoading, isError } = useOrdenesPicking()

  function alternar(id: string) {
    setAbiertas((prev) => {
      const sig = new Set(prev)
      if (sig.has(id)) sig.delete(id)
      else sig.add(id)
      return sig
    })
  }
  usePickingMasivoRealtime()

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return ordenes.filter((o) =>
      (filtro === 'todas' || o.estado === filtro) &&
      (!dia || o.creadoEn.slice(0, 10) === dia) &&
      (!q || o.numeroOc.toLowerCase().includes(q) || (o.nombreCliente ?? '').toLowerCase().includes(q)))
  }, [ordenes, filtro, busqueda, dia])

  if (importar && puedeCargar) {
    return <ImportarOCFlow usuarioId={usuarioId} onVolver={() => setImportar(false)} onCreada={(id) => navigate(`/picking-masivo/${id}`)} />
  }

  const kpis: { clave: Filtro; label: string; valor: number }[] = [
    { clave: 'todas',      label: 'Todas',          valor: ordenes.length },
    { clave: 'activa',     label: 'En proceso',     valor: ordenes.filter((o) => o.estado === 'activa').length },
    { clave: 'completada', label: 'Completadas',    valor: ordenes.filter((o) => o.estado === 'completada').length },
  ]

  return (
    <div className="pmo-page">
      <header className="pmo-header">
        <h1 className="pmo-titulo">Gestión de Picking Masivo</h1>
        {puedeCargar && (
          <button className="btn-primario pmo-btn-nueva" onClick={() => setImportar(true)}>+ Cargar OC</button>
        )}
      </header>
      <SubtituloModulo modulo="pickingMasivo" />

      <div className="pmo-kpis">
        {kpis.map((k) => (
          <button key={k.clave} className={`pmo-kpi ${filtro === k.clave ? 'pmo-kpi--activo' : ''}`} onClick={() => setFiltro(k.clave)}>
            <span className="pmo-kpi-valor">{k.valor}</span>
            <span className="pmo-kpi-label">{k.label}</span>
          </button>
        ))}
      </div>

      <div className="pmo-filtros">
        <input className="pmo-buscar" placeholder="🔍 Buscar por cliente u OC…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <label className="pmo-fecha">
          <span>Fecha creación</span>
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
          {dia && <button className="pmo-fecha-limpiar" onClick={() => setDia('')} aria-label="Quitar fecha">✕</button>}
        </label>
      </div>

      {isLoading && <p className="cargando">Cargando órdenes…</p>}
      {isError && <p className="error">Error al cargar las órdenes</p>}
      {!isLoading && !isError && visibles.length === 0 && (
        <p className="pmo-vacio">{ordenes.length === 0 ? 'Aún no hay órdenes de compra cargadas' : 'No hay órdenes con estos filtros'}</p>
      )}

      {visibles.length > 0 && (
        <div className="pmo-tabla-ordenes">
          <div className="pmo-fila pmo-fila--encabezado">
            <span>Cliente</span>
            <span>Estado</span>
            <span>Acciones</span>
          </div>

          {visibles.map((o) => {
            const hacerPicking = o.estado === 'activa' && rol === 'operador'
            const abierta = abiertas.has(o.id)
            return (
              <div key={o.id} className={`pmo-fila pmo-fila--${o.estado}`}>
                <div className="pmo-col-orden">
                  <button className="pmo-cliente-btn" aria-expanded={abierta} onClick={() => alternar(o.id)}>
                    <span className="pmo-cliente">{o.nombreCliente ?? '—'}</span>
                    <span className={`pmo-chevron ${abierta ? 'pmo-chevron--abierto' : ''}`} aria-hidden="true">▾</span>
                  </button>
                  {abierta && (
                    <div className="pmo-cliente-detalle">
                      <span><b>OC:</b> {o.numeroOc}</span>
                    </div>
                  )}
                </div>

                <div className="pmo-col-estado">
                  <span className={`pmo-badge pmo-badge--${o.estado}`}>{ETIQUETA_ESTADO[o.estado] ?? o.estado}</span>
                </div>

                <div className="pmo-col-acciones">
                  <button className={`pmo-btn-ver ${hacerPicking ? 'pmo-btn-ver--picking' : ''}`} onClick={() => navigate(`/picking-masivo/${o.id}`)}>
                    {hacerPicking ? 'Picking' : <><IcoOjo /> Ver</>}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
