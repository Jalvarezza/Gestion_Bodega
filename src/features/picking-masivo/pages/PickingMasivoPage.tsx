import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrdenesPicking, usePickingMasivoRealtime } from '../hooks/usePickingMasivo'
import { ImportarOCFlow } from '../components/ImportarOCFlow'

type Filtro = 'todas' | 'activa' | 'completada'

const ETIQUETA_ESTADO: Record<string, string> = { activa: 'En preparación', completada: 'Completada' }

const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('-') : '—')

export function PickingMasivoPage() {
  const navigate  = useNavigate()
  const usuarioId = localStorage.getItem('user_id') ?? ''
  const rol       = localStorage.getItem('user_rol') ?? ''
  const puedeCargar = rol === 'admin' || rol === 'supervisor'

  const [importar, setImportar] = useState(false)
  const [filtro, setFiltro]     = useState<Filtro>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [dia, setDia]           = useState('')
  const { data: ordenes = [], isLoading, isError } = useOrdenesPicking()
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
    { clave: 'activa',     label: 'En preparación', valor: ordenes.filter((o) => o.estado === 'activa').length },
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

      <div className="pmo-kpis">
        {kpis.map((k) => (
          <button key={k.clave} className={`pmo-kpi ${filtro === k.clave ? 'pmo-kpi--activo' : ''}`} onClick={() => setFiltro(k.clave)}>
            <span className="pmo-kpi-valor">{k.valor}</span>
            <span className="pmo-kpi-label">{k.label}</span>
          </button>
        ))}
      </div>

      <div className="pmo-filtros">
        <input className="pmo-buscar" placeholder="Buscar por OC o cliente…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
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
            <span>Orden / Cliente</span>
            <span>Avance</span>
            <span>Creación</span>
            <span>Estado</span>
            <span className="pmo-col-acciones">Acciones</span>
          </div>

          {visibles.map((o) => {
            const pct = o.unidadesPedidas > 0 ? Math.round((o.unidadesPickeadas / o.unidadesPedidas) * 100) : 0
            return (
              <div key={o.id} className={`pmo-fila pmo-fila--${o.estado}`}>
                <div className="pmo-col-orden">
                  <span className="pmo-oc">OC {o.numeroOc}</span>
                  <span className="pmo-cliente">{o.nombreCliente ?? '—'}</span>
                </div>

                <div className="pmo-col-avance">
                  <div className="pmo-avance-cabecera">
                    <span>{o.lineasResueltas}/{o.totalLineas} líneas</span>
                    <strong>{pct}%</strong>
                  </div>
                  <div className="pmo-barra"><div className="pmo-barra-relleno" style={{ width: `${pct}%` }} /></div>
                  <span className="pmo-sub">
                    {o.unidadesPickeadas.toLocaleString('es-CL')} / {o.unidadesPedidas.toLocaleString('es-CL')} uds
                    {o.estado === 'activa' && o.operadoresActivos > 0 && ` · ${o.operadoresActivos} trabajando`}
                  </span>
                </div>

                <div className="pmo-col-creacion">
                  <span>{fecha(o.creadoEn)}</span>
                  <span className="pmo-sub">{o.creadoPorNombre ?? '—'}</span>
                </div>

                <div>
                  <span className={`pmo-badge pmo-badge--${o.estado}`}>{ETIQUETA_ESTADO[o.estado] ?? o.estado}</span>
                </div>

                <div className="pmo-col-acciones">
                  <button className="pmo-btn-ver" onClick={() => navigate(`/picking-masivo/${o.id}`)}>
                    {o.estado === 'activa' && rol === 'operador' ? 'Hacer picking' : 'Ver detalle'}
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
