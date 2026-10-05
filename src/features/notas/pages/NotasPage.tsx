import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotas } from '../hooks/useNotas'
import { useConectividad } from '../../../shared/hooks/useConectividad'
import { ImportarNotaFlow } from '../components/ImportarNotaFlow'
import type { NotaResumen } from '../services/notas.api'

const ESTADO_LABELS: Record<string, string> = {
  pendiente:   'Pendiente',
  preparacion: 'En preparación',
  completa:    'Completa',
  despachada:  'Despachada',
  anulada:     'Anulada',
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DIAS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))

function BadgeEstado({ estado }: { estado: string }) {
  return <span className={`badge badge-${estado.replace('_', '-')}`}>{ESTADO_LABELS[estado] ?? estado}</span>
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function IconFiltro() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
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
function IcoClock({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
function IcoUser({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
}
function IcoKpiPending({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
function IcoKpiPrep({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  )
}
function IcoKpiDone({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <polyline points="20 6 9 17 4 12"/>
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

function horaCompletada(fecha: string): string {
  const d = new Date(fecha)
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function BarraProgreso({ completados, total }: { completados: number; total: number }) {
  const pct = total > 0 ? Math.round((completados / total) * 100) : 0
  return (
    <div className="nota-card-progress-wrap">
      <div className="nota-card-progress-bar">
        <div className="nota-card-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="nota-card-progress-pct">{pct}%</span>
    </div>
  )
}

export function NotasPage() {
  const navigate    = useNavigate()
  const { offline } = useConectividad()
  const ADMIN_ID    = localStorage.getItem('user_id') ?? ''
  const ROL         = localStorage.getItem('user_rol') ?? ''
  const [tabActivo,       setTabActivo]       = useState<'pendientes' | 'completas'>('pendientes')
  const [filtroAnio,      setFiltroAnio]      = useState<string | undefined>(undefined)
  const [filtroMes,       setFiltroMes]       = useState<string | undefined>(undefined)
  const [filtroDia,       setFiltroDia]       = useState<string | undefined>(undefined)
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [busqueda,        setBusqueda]        = useState('')
  const [importar,        setImportar]        = useState(false)
  const [seleccionadaId,  setSeleccionadaId]  = useState<string | null>(null)
  const { data, isLoading, isError, refetch } = useNotas(undefined)

  const notas = data ?? []

  const hoy = new Date().toISOString().slice(0, 10)

  const kpis = useMemo(() => ({
    pendientes:      notas.filter((n) => n.estado === 'pendiente').length,
    enPreparacion:   notas.filter((n) => n.estado === 'preparacion').length,
    completadasHoy:  notas.filter((n) => n.estado === 'completa' && n.fechaPreparacion?.startsWith(hoy)).length,
  }), [notas, hoy])

  const aniosDisponibles = useMemo(() => {
    const años = new Set(notas.map((n) => n.creadoEn?.slice(0, 4)).filter(Boolean))
    return Array.from(años).sort().reverse()
  }, [notas])

  const tieneFiltrFecha = !!(filtroAnio || filtroMes || filtroDia)

  const notasFiltradas = useMemo(() => {
    let lista = notas
    if (tabActivo === 'pendientes') {
      lista = lista.filter((n) => n.estado === 'pendiente' || n.estado === 'preparacion')
    } else {
      lista = lista.filter((n) => n.estado === 'completa')
      if (!tieneFiltrFecha) {
        lista = lista.filter((n) => n.fechaPreparacion?.startsWith(hoy))
      }
    }
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase()
      lista = lista.filter((n) => n.numeroNota.toLowerCase().includes(q) || n.nombreCliente.toLowerCase().includes(q))
    }
    if (tabActivo === 'completas') {
      if (filtroAnio) lista = lista.filter((n) => n.fechaPreparacion?.slice(0, 4) === filtroAnio)
      if (filtroMes)  lista = lista.filter((n) => n.fechaPreparacion?.slice(5, 7) === filtroMes)
      if (filtroDia)  lista = lista.filter((n) => n.fechaPreparacion?.slice(8, 10) === filtroDia)
    } else {
      if (filtroAnio) lista = lista.filter((n) => n.creadoEn?.slice(0, 4) === filtroAnio)
      if (filtroMes)  lista = lista.filter((n) => n.creadoEn?.slice(5, 7) === filtroMes)
      if (filtroDia)  lista = lista.filter((n) => n.creadoEn?.slice(8, 10) === filtroDia)
    }
    return lista
  }, [notas, tabActivo, busqueda, filtroAnio, filtroMes, filtroDia, tieneFiltrFecha, hoy])

  if (importar && ROL === 'admin') {
    return (
      <ImportarNotaFlow
        adminId={ADMIN_ID}
        onVolver={() => setImportar(false)}
        onCreada={(notaId) => { setImportar(false); refetch(); navigate(`/notas/${notaId}`) }}
      />
    )
  }

  const filtrosActivos = [filtroAnio, filtroMes, filtroDia].filter(Boolean).length

  function limpiarFiltros() {
    setFiltroAnio(undefined)
    setFiltroMes(undefined)
    setFiltroDia(undefined)
  }

  function esTomadaPorOtro(nota: NotaResumen): boolean {
    return !!nota.tomadaPor && nota.tomadaPor !== ADMIN_ID
  }

  function labelBoton(nota: NotaResumen): string {
    if (nota.estado === 'completa') return 'Ver nota'
    if (ROL === 'admin' || ROL === 'supervisor') return 'Ver detalle →'
    if (nota.estado === 'preparacion') return 'Continuar Picking →'
    return 'Iniciar Picking →'
  }

  return (
    <div className="notas-page">
      <h1 className="notas-titulo">NV preparación</h1>

      {offline && <div className="aviso-offline">Sin conexión — modo solo lectura.</div>}

      {/* KPI strip */}
      {!isLoading && !isError && (
        <div className="notas-kpi-row">
          <div className={`notas-kpi-card ${tabActivo === 'pendientes' && kpis.pendientes > 0 ? 'notas-kpi-card--amber' : ''}`}>
            <span className="notas-kpi-icon"><IcoKpiPending /></span>
            <div>
              <span className="notas-kpi-num">{kpis.pendientes}</span>
              <span className="notas-kpi-label">Pendientes</span>
            </div>
          </div>
          <div className={`notas-kpi-card ${kpis.enPreparacion > 0 ? 'notas-kpi-card--blue' : ''}`}>
            <span className="notas-kpi-icon"><IcoKpiPrep /></span>
            <div>
              <span className="notas-kpi-num">{kpis.enPreparacion}</span>
              <span className="notas-kpi-label">En preparación</span>
            </div>
          </div>
          <div className={`notas-kpi-card ${kpis.completadasHoy > 0 ? 'notas-kpi-card--green' : ''}`}>
            <span className="notas-kpi-icon"><IcoKpiDone /></span>
            <div>
              <span className="notas-kpi-num">{kpis.completadasHoy}</span>
              <span className="notas-kpi-label">Completadas hoy</span>
            </div>
          </div>
        </div>
      )}

      {/* Búsqueda + Filtro */}
      <div className="notas-toolbar">
        <div className="ing-busqueda">
          <span className="ing-busqueda-icono"><IconSearch /></span>
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
          <IconFiltro />
          Filtro
          {filtrosActivos > 0 && <span className="ing-filtrar-badge">{filtrosActivos}</span>}
        </button>
        {ROL === 'admin' && (
          <button className="btn-primario" style={{ flexShrink: 0 }} onClick={() => setImportar(true)} disabled={offline}>
            + NV
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="sal-tabs-estado">
        <button
          type="button"
          className={`sal-estado-btn ${tabActivo === 'pendientes' ? 'sal-estado-btn--activo' : ''}`}
          onClick={() => { setTabActivo('pendientes'); setSeleccionadaId(null) }}
        >
          Pendiente
          {kpis.pendientes + kpis.enPreparacion > 0 && (
            <span className="notas-tab-badge">{kpis.pendientes + kpis.enPreparacion}</span>
          )}
        </button>
        <button
          type="button"
          className={`sal-estado-btn ${tabActivo === 'completas' ? 'sal-estado-btn--activo sal-estado-btn--completa' : ''}`}
          onClick={() => { setTabActivo('completas'); setSeleccionadaId(null) }}
        >
          Completa
        </button>
      </div>

      {tabActivo === 'completas' && !tieneFiltrFecha && (
        <div className="sal-hoy-banner">
          Mostrando completadas de hoy
          <button className="sal-hoy-ver-anteriores" onClick={() => setFiltrosAbiertos(true)}>
            Ver anteriores
          </button>
        </div>
      )}

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
                {MESES.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                ))}
              </select>
              <select className="ing-filtro-select" value={filtroAnio ?? ''} onChange={(e) => setFiltroAnio(e.target.value || undefined)}>
                <option value="">Año</option>
                {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          {filtrosActivos > 0 && (
            <button type="button" className="ing-filtro-limpiar" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {isLoading && <p className="cargando">Cargando notas…</p>}
      {isError   && <p className="error">Error al cargar notas</p>}

      {!isLoading && !isError && notasFiltradas.length === 0 && (
        <div className="notas-vacio">
          <p>{filtrosActivos > 0
            ? 'Sin resultados para el filtro aplicado'
            : tabActivo === 'pendientes'
              ? 'No hay notas pendientes de preparación'
              : 'No hay notas completas'
          }</p>
        </div>
      )}

      {!isLoading && !isError && notasFiltradas.length > 0 && (
        <div className="notas-cards">
          {notasFiltradas.map((nota: NotaResumen) => {
            const marcada   = nota.notaId === seleccionadaId
            const bloqueada = esTomadaPorOtro(nota)
            const pct       = nota.totalProductos > 0 ? Math.round((nota.productosCompletos / nota.totalProductos) * 100) : 0

            return (
              <div
                key={nota.notaId}
                className={`nota-card ${marcada ? 'nota-card--marcada' : ''} ${bloqueada ? 'nota-card--bloqueada' : ''}`}
              >
                {/* Cabecera: check + NV + estado */}
                <div className="nota-card-header">
                  <button
                    type="button"
                    className={`nota-fila-check ${marcada ? 'nota-fila-check--activo' : ''}`}
                    aria-pressed={marcada}
                    aria-label={marcada ? `Quitar selección` : `Seleccionar ${nota.numeroNota}`}
                    onClick={() => setSeleccionadaId((cur) => (cur === nota.notaId ? null : nota.notaId))}
                  >
                    {marcada && <IconCheck />}
                  </button>
                  <span className="nota-card-numero">{nota.numeroNota}</span>
                  <div className="nota-card-estado">
                    <BadgeEstado estado={nota.estado} />
                  </div>
                </div>

                {/* Cliente */}
                <div className="nota-card-cliente">{nota.nombreCliente}</div>

                <hr className="nota-card-divider" />

                {/* Meta row */}
                <div className="nota-card-meta">
                  <div className="nota-card-meta-izq">
                    <span className="nota-expand-item">
                      <IcoBox size={14} />
                      {nota.productosCompletos}/{nota.totalProductos} ítems
                    </span>
                    {nota.estado === 'preparacion' && (
                      <BarraProgreso completados={nota.productosCompletos} total={nota.totalProductos} />
                    )}
                    <span className="nota-card-sep" aria-hidden="true">|</span>
                    <span className="nota-expand-item">
                      <IcoClock size={14} />
                      {nota.estado === 'completa' && nota.fechaPreparacion
                        ? horaCompletada(nota.fechaPreparacion)
                        : tiempoRelativo(nota.creadoEn)
                      }
                    </span>
                    <span className="nota-card-sep" aria-hidden="true">|</span>
                    <span className="nota-expand-item">
                      <IcoUser size={14} />
                      {nota.estado === 'completa'
                        ? (nota.completadaPor ?? nota.importadoPor ?? 'Sin asignar')
                        : nota.tomadaPor
                          ? (bloqueada ? 'En preparación' : 'Asignado')
                          : 'Sin asignar'
                      }
                    </span>
                  </div>

                  {marcada && (
                    <button
                      className={`btn-primario nota-card-btn ${nota.estado === 'preparacion' ? 'nota-card-btn--continuar' : ''}`}
                      disabled={bloqueada}
                      onClick={() => navigate(`/notas/${nota.notaId}`)}
                    >
                      {labelBoton(nota)}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
