import { useState, useMemo } from 'react'
import { useNotasParaRevision } from '../hooks/useSalidas'
import { useDetalleNota } from '../../notas/hooks/useNotas'
import { RevisionFlow } from '../components/RevisionFlow'
import { ImportarNotaRevisionFlow } from '../components/ImportarNotaRevisionFlow'
import { DevolucionFlow } from '../components/DevolucionFlow'
import { useConectividad } from '../../../shared/hooks/useConectividad'
import type { NotaParaRevision } from '../services/salidas.api'
import type { ItemRevision } from '../components/RevisionFlow'

type Vista =
  | { tipo: 'lista' }
  | { tipo: 'importar' }
  | { tipo: 'revision';   notaId: string; estadoNota: 'completa' | 'despachada'; nombreChofer: string | null; tieneDev: boolean }
  | { tipo: 'devolucion'; notaId: string }

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DIAS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))

// ─── Iconos ────────────────────────────────────────────────────────────────
function IcoSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}
function IcoFiltro() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}
function IcoScan({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <line x1="7" y1="12" x2="17" y2="12"/>
    </svg>
  )
}
function IcoTruck({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
      <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  )
}
function IcoClock({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
function IcoBox({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  )
}
function IcoCheck({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function IcoDoc({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}

function tiempoRelativo(fecha: string): string {
  const diff = Date.now() - new Date(fecha).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d !== 1 ? 's' : ''}`
}

function horaDespacho(fecha: string): string {
  const d = new Date(fecha)
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

// ─── RevisionConDetalle ────────────────────────────────────────────────────
function RevisionConDetalle({
  notaId, estadoNota, nombreChofer, adminId, offline, tieneDev, onCerrar,
}: {
  notaId: string; estadoNota: 'completa' | 'despachada'
  nombreChofer: string | null; adminId: string; offline: boolean; tieneDev: boolean; onCerrar: () => void
}) {
  const { data, isLoading, isError } = useDetalleNota(notaId)
  if (isLoading) return <p className="cargando">Cargando productos…</p>
  if (isError || !data) return <p className="error">Error al cargar la nota</p>

  const items: ItemRevision[] = data.productos.map((p) => ({
    notaProductoId:          p.notaProductoId,
    sku:                     p.sku,
    nombre:                  p.nombre,
    codigoBarra:             p.codigoBarra,
    codigoBarraAlternativo:  p.codigoBaRalternativo ?? null,
    cantidadSolicitada:      p.cantidadSolicitada,
    cantidadDespachada:      p.cantidadDespachada,
    revisadoAdmin:           p.revisadoAdmin || p.estado === 'sin_stock',
    estado:                  p.estado,
    skuEquivalente:          p.skuEquivalente ?? null,
  }))

  return (
    <RevisionFlow
      notaId={notaId}
      numeroNota={data.numeroNota}
      nombreCliente={data.nombreCliente}
      rutCliente={data.rutCliente}
      numeroOc={data.numeroOc}
      comentarioDespacho={data.comentarioDespacho}
      adminId={adminId}
      items={items}
      estadoNota={estadoNota}
      nombreChofer={nombreChofer}
      fechaPreparacion={(data as any).fechaPreparacion ?? null}
      fechaDespacho={(data as any).fechaDespacho ?? null}
      tieneDev={tieneDev}
      devolucion={(data as any).devolucion ?? null}
      offline={offline}
      onCerrar={onCerrar}
    />
  )
}

// ─── Página principal ──────────────────────────────────────────────────────
export function SalidasPage() {
  const adminId     = localStorage.getItem('user_id') ?? ''
  const esAdmin     = ['admin', 'supervisor'].includes(localStorage.getItem('user_rol') ?? '')
  const { offline } = useConectividad()
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const { data, isLoading, isError } = useNotasParaRevision()

  const [busqueda,        setBusqueda]        = useState('')
  const [filtroAnio,      setFiltroAnio]      = useState<string | undefined>(undefined)
  const [filtroMes,       setFiltroMes]       = useState<string | undefined>(undefined)
  const [filtroDia,       setFiltroDia]       = useState<string | undefined>(undefined)
  const [filtroCliente,   setFiltroCliente]   = useState('')
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [tabActivo,       setTabActivo]       = useState<'revision' | 'despachadas'>('revision')

  const notas = useMemo(() => data ?? [], [data])
  const hoy   = new Date().toISOString().slice(0, 10)

  const kpis = useMemo(() => ({
    porAuditar:      notas.filter((n) => n.estado === 'completa').length,
    despachadasHoy:  notas.filter((n) => n.estado === 'despachada' && n.fechaDespacho?.startsWith(hoy)).length,
  }), [notas, hoy])

  const aniosDisponibles = useMemo(() => {
    const años = new Set(notas.map((n) => n.creadoEn?.slice(0, 4)).filter(Boolean))
    return Array.from(años).sort().reverse()
  }, [notas])

  const clientesDisponibles = useMemo(() => {
    const estadoFiltro = tabActivo === 'revision' ? 'completa' : 'despachada'
    const set = new Set(notas.filter((n) => n.estado === estadoFiltro).map((n) => n.nombreCliente).filter(Boolean))
    return Array.from(set).sort()
  }, [notas, tabActivo])

  const tieneFiltrFecha = !!(filtroAnio || filtroMes || filtroDia)

  const notasFiltradas = useMemo(() => {
    const estadoFiltro = tabActivo === 'revision' ? 'completa' : 'despachada'
    let lista = notas.filter((n) => n.estado === estadoFiltro)

    // En despachadas: mostrar solo hoy cuando no hay filtro de fecha activo
    if (tabActivo === 'despachadas' && !tieneFiltrFecha) {
      lista = lista.filter((n) => n.fechaDespacho?.startsWith(hoy))
    }

    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase()
      lista = lista.filter((n) => n.numeroNota.toLowerCase().includes(q) || n.nombreCliente.toLowerCase().includes(q))
    }
    if (filtroCliente) lista = lista.filter((n) => n.nombreCliente === filtroCliente)
    if (filtroAnio)    lista = lista.filter((n) => n.fechaDespacho?.slice(0, 4) === filtroAnio)
    if (filtroMes)     lista = lista.filter((n) => n.fechaDespacho?.slice(5, 7) === filtroMes)
    if (filtroDia)     lista = lista.filter((n) => n.fechaDespacho?.slice(8, 10) === filtroDia)
    return lista
  }, [notas, tabActivo, busqueda, filtroAnio, filtroMes, filtroDia, filtroCliente, tieneFiltrFecha, hoy])

  const filtrosActivos = [filtroAnio, filtroMes, filtroDia, filtroCliente].filter(Boolean).length

  function limpiarFiltros() {
    setFiltroAnio(undefined); setFiltroMes(undefined)
    setFiltroDia(undefined);  setFiltroCliente('')
  }

  function abrirRevision(nota: NotaParaRevision) {
    setVista({ tipo: 'revision', notaId: nota.notaId, estadoNota: nota.estado, nombreChofer: nota.nombreChofer, tieneDev: nota.tieneDev })
  }

  if (vista.tipo === 'importar') {
    return (
      <ImportarNotaRevisionFlow
        adminId={adminId}
        onVolver={() => setVista({ tipo: 'lista' })}
        onCreada={(notaId) => setVista({ tipo: 'revision', notaId, estadoNota: 'completa', nombreChofer: null, tieneDev: false })}
      />
    )
  }

  if (vista.tipo === 'revision') {
    return (
      <RevisionConDetalle
        notaId={vista.notaId}
        estadoNota={vista.estadoNota}
        nombreChofer={vista.nombreChofer}
        adminId={adminId}
        offline={offline}
        tieneDev={vista.tieneDev}
        onCerrar={() => setVista({ tipo: 'lista' })}
      />
    )
  }

  if (vista.tipo === 'devolucion') {
    return (
      <DevolucionFlow
        notaId={vista.notaId}
        adminId={adminId}
        onCerrar={() => setVista({ tipo: 'lista' })}
      />
    )
  }

  return (
    <div className="notas-page">
      <h1 className="notas-titulo">NV Despacho</h1>

      {offline && <div className="aviso-offline">Sin conexión — modo solo lectura.</div>}

      {/* KPI strip */}
      {!isLoading && !isError && (
        <div className="notas-kpi-row">
          <div className={`notas-kpi-card ${kpis.porAuditar > 0 ? 'notas-kpi-card--amber' : ''}`}>
            <span className="notas-kpi-icon"><IcoScan size={18} /></span>
            <div>
              <span className="notas-kpi-num">{kpis.porAuditar}</span>
              <span className="notas-kpi-label">Por Revisar</span>
            </div>
          </div>
          <div className={`notas-kpi-card ${kpis.despachadasHoy > 0 ? 'notas-kpi-card--green' : ''}`}>
            <span className="notas-kpi-icon"><IcoTruck size={18} /></span>
            <div>
              <span className="notas-kpi-num">{kpis.despachadasHoy}</span>
              <span className="notas-kpi-label">Despachadas hoy</span>
            </div>
          </div>
        </div>
      )}

      {/* Búsqueda + Filtro */}
      <div className="notas-toolbar">
        <div className="ing-busqueda">
          <span className="ing-busqueda-icono"><IcoSearch /></span>
          <input
            type="search"
            placeholder="Buscar por número de NV o cliente"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            autoComplete="off"
          />
          {busqueda && (
            <button className="ing-busqueda-limpiar" onClick={() => setBusqueda('')}>✕</button>
          )}
        </div>
        <button
          type="button"
          className={`ing-filtrar-btn ${filtrosAbiertos ? 'ing-filtrar-btn--abierto' : ''}`}
          aria-expanded={filtrosAbiertos}
          onClick={() => setFiltrosAbiertos((v) => !v)}
        >
          <IcoFiltro />
          Filtro
          {filtrosActivos > 0 && <span className="ing-filtrar-badge">{filtrosActivos}</span>}
        </button>
      </div>

      {/* Tabs */}
      <div className="sal-tabs-estado">
        <button
          type="button"
          className={`sal-estado-btn ${tabActivo === 'revision' ? 'sal-estado-btn--activo' : ''}`}
          onClick={() => { setTabActivo('revision'); limpiarFiltros() }}
        >
          Listas para revisar
          {kpis.porAuditar > 0 && (
            <span className="notas-tab-badge">{kpis.porAuditar}</span>
          )}
        </button>
        <button
          type="button"
          className={`sal-estado-btn ${tabActivo === 'despachadas' ? 'sal-estado-btn--activo sal-estado-btn--despachada' : ''}`}
          onClick={() => { setTabActivo('despachadas'); limpiarFiltros() }}
        >
          Despachadas
        </button>
      </div>

      {/* Filtros */}
      {filtrosAbiertos && (
        <div className="ing-filtros-panel">
          <div className="ing-filtro-grupo">
            <span className="ing-filtro-label">Fecha</span>
            <div className="ing-filtro-opciones">
              <select className="ing-filtro-select" value={filtroDia ?? ''} onChange={(e) => setFiltroDia(e.target.value || undefined)}>
                <option value="">Día</option>
                {DIAS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select className="ing-filtro-select" value={filtroMes ?? ''} onChange={(e) => setFiltroMes(e.target.value || undefined)}>
                <option value="">Mes</option>
                {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
              </select>
              <select className="ing-filtro-select" value={filtroAnio ?? ''} onChange={(e) => setFiltroAnio(e.target.value || undefined)}>
                <option value="">Año</option>
                {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="ing-filtro-grupo" style={{ marginTop: 8 }}>
            <span className="ing-filtro-label">Cliente</span>
            <select className="ing-filtro-select" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}
              style={{ width: '100%' }}>
              <option value="">Todos los clientes</option>
              {clientesDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {filtrosActivos > 0 && (
            <button type="button" className="ing-filtro-limpiar" onClick={limpiarFiltros} style={{ marginTop: 8 }}>
              Limpiar filtros ({filtrosActivos})
            </button>
          )}
        </div>
      )}

      {isLoading && <p className="cargando">Cargando notas…</p>}
      {isError   && <p className="error">Error al cargar notas</p>}

      {/* Indicador: mostrando solo hoy */}
      {tabActivo === 'despachadas' && !tieneFiltrFecha && (
        <div className="sal-hoy-banner">
          Mostrando despachos de hoy
          <button
            className="sal-hoy-ver-anteriores"
            onClick={() => setFiltrosAbiertos(true)}
          >
            Ver anteriores
          </button>
        </div>
      )}

      {!isLoading && !isError && notasFiltradas.length === 0 && (
        <div className="notas-vacio">
          <p>{filtrosActivos > 0 || busqueda
            ? 'Sin resultados para el filtro aplicado'
            : tabActivo === 'despachadas'
              ? 'No hay notas despachadas hoy'
              : 'No hay notas listas para revisar'
          }</p>
        </div>
      )}

      {/* Cards */}
      {!isLoading && !isError && notasFiltradas.length > 0 && (
        <div className="notas-cards">
          {notasFiltradas.map((nota: NotaParaRevision) => {
            const esDespachada = nota.estado === 'despachada'
            return (
              <div key={nota.notaId} className="nota-card sal-card">
                {/* Cabecera */}
                <div className="nota-card-header">
                  <span className="nota-card-numero">{nota.numeroNota}</span>
                  <span className={`badge ${esDespachada ? 'badge-despachada' : 'badge-completa'}`}>
                    {esDespachada ? 'Despachada' : 'Lista para revisar'}
                  </span>
                </div>

                {/* Cliente */}
                <div className="nota-card-cliente" style={{ marginLeft: 0 }}>{nota.nombreCliente}</div>

                <hr className="nota-card-divider" />

                {/* Meta row */}
                <div className="nota-card-meta">
                  <div className="nota-card-meta-izq">
                    {/* Ítems */}
                    <span className="nota-expand-item">
                      <IcoBox size={14} />
                      {nota.totalProductos} ítem{nota.totalProductos !== 1 ? 's' : ''}
                    </span>
                    <span className="nota-card-sep" aria-hidden="true">|</span>
                    {/* Hora de despacho */}
                    <span className="nota-expand-item">
                      <IcoClock size={14} />
                      {esDespachada && nota.fechaDespacho
                        ? horaDespacho(nota.fechaDespacho)
                        : tiempoRelativo(nota.actualizadoEn ?? nota.creadoEn)
                      }
                    </span>
                    <span className="nota-card-sep" aria-hidden="true">|</span>
                    {/* Chofer */}
                    <span className="nota-expand-item">
                      <IcoTruck size={14} />
                      {nota.nombreChofer ? nota.nombreChofer : 'Sin chofer'}
                    </span>
                    {/* Comentario despacho */}
                    {nota.comentarioDespacho && (
                      <>
                        <span className="nota-card-sep" aria-hidden="true">|</span>
                        <span className="nota-expand-item sal-comentario" title={nota.comentarioDespacho}>
                          {nota.comentarioDespacho}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Botones de acción */}
                  <div className="sal-card-acciones">
                    <button
                      className={`btn-primario nota-card-btn ${esDespachada ? 'sal-btn-revisar' : 'sal-btn-auditar'}`}
                      disabled={offline}
                      onClick={() => abrirRevision(nota)}
                    >
                      {esDespachada
                        ? <><IcoDoc size={14} /> Ver despacho</>
                        : <><IcoScan size={14} /> Revisar NV</>
                      }
                    </button>
                    {esDespachada && esAdmin && !nota.tieneDev && (
                      <button
                        className="btn-primario nota-card-btn sal-btn-devolucion"
                        disabled={offline}
                        onClick={() => setVista({ tipo: 'devolucion', notaId: nota.notaId })}
                      >
                        Devolución
                      </button>
                    )}
                    {esDespachada && nota.tieneDev && (
                      <span className={`badge sal-badge-devolucion sal-badge-devolucion--${nota.tipoDev ?? 'parcial'}`}>
                        {nota.tipoDev === 'total' ? 'Dev. total' : 'Dev. parcial'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
