import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useImportaciones, useDetalleImportacion } from '../hooks/useIngresos'
import { UbicarDetalleFlow }    from '../components/UbicarDetalleFlow'
import { ImportarOCFlow }       from '../components/ImportarOCFlow'
import { ImportarOCFlowYLK }    from '../components/ImportarOCFlowYLK'
import { useConectividad }      from '../../../shared/hooks/useConectividad'
import type { ImportacionResumen, DetalleImportacion } from '../services/ingresos.api'


type Vista =
  | { tipo: 'lista' }
  | { tipo: 'seleccionarProveedor' }
  | { tipo: 'importar' }
  | { tipo: 'importarYLK' }
  | { tipo: 'detalle'; importacionId: string }
  | { tipo: 'ubicar'; importacionId: string; detalle: DetalleImportacion['detalles'][number] }

// ── Selección de proveedor ────────────────────────────────────────────────

function SeleccionProveedor({
  onSeleccionar,
  onVolver,
}: {
  onSeleccionar: (proveedor: 'shunde' | 'ylk') => void
  onVolver:      () => void
}) {
  return (
    <div className="importar-oc">
      <div className="importar-header">
        <button className="btn-volver" onClick={onVolver}>← Volver</button>
        <h2>Nueva importación</h2>
      </div>
      <p className="importar-proveedor-subtitulo">Selecciona el formato del Packing List del proveedor:</p>
      <div className="importar-proveedor-grid">
        <button
          className="importar-proveedor-card"
          onClick={() => onSeleccionar('shunde')}
        >
          <span className="importar-proveedor-nombre">Shunde Native</span>
          <span className="importar-proveedor-desc">PDF Orden de Compra + Packing List XLS</span>
        </button>
        <button
          className="importar-proveedor-card"
          onClick={() => onSeleccionar('ylk')}
        >
          <span className="importar-proveedor-nombre">YLK</span>
          <span className="importar-proveedor-desc"> PDF Orden de Compra + Packing List YLK </span>
        </button>
      </div>
    </div>
  )
}

// ── Íconos ────────────────────────────────────────────────────────────────

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}>
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function IconDoc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
}
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function IconBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  )
}
function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <polyline points="9 18 15 12 9 6"/>
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
function IconBox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    </svg>
  )
}

// ── Badge estado ──────────────────────────────────────────────────────────

const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  parcial:   'Parcial',
  completa:  'Completa',
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatearFecha(fecha?: string | null): string {
  if (!fecha) return ''
  return fecha.slice(0, 10).split('-').reverse().join('-')
}

function BadgeEstado({ estado }: { estado: string }) {
  return <span className={`badge badge-${estado}`}>{ESTADO_LABELS[estado] ?? estado}</span>
}

// ── Lista de importaciones ────────────────────────────────────────────────

function ListaImportaciones({
  seleccionadaId,
  onSeleccionar,
  onVerOC,
  onNuevaImportacion,
}: {
  seleccionadaId:     string | null
  onSeleccionar:      (id: string) => void
  onVerOC:            () => void
  onNuevaImportacion: () => void
}) {
  const [filtroEstado, setFiltroEstado] = useState<string | undefined>(undefined)
  const [filtroAnio,   setFiltroAnio]   = useState<string | undefined>(undefined)
  const [filtroMes,    setFiltroMes]    = useState<string | undefined>(undefined)
  const [busqueda,     setBusqueda]     = useState('')
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const { data, isLoading, isError }    = useImportaciones(filtroEstado)

  const aniosDisponibles = useMemo(() => {
    const años = new Set((data ?? []).map((imp) => imp.fechaIngreso?.slice(0, 4)).filter(Boolean))
    return Array.from(años).sort().reverse()
  }, [data])

  const resultado = useMemo(() => {
    let lista = data ?? []
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase()
      lista = lista.filter((imp) => imp.numeroOc.toLowerCase().includes(q) || imp.codigo.toLowerCase().includes(q))
    }
    if (filtroAnio) lista = lista.filter((imp) => imp.fechaIngreso?.slice(0, 4) === filtroAnio)
    if (filtroMes)  lista = lista.filter((imp) => imp.fechaIngreso?.slice(5, 7) === filtroMes)
    return lista
  }, [data, busqueda, filtroAnio, filtroMes])

  const filtrosActivos = [filtroAnio, filtroMes].filter(Boolean).length

  function limpiarFiltros() {
    setFiltroEstado(undefined)
    setFiltroAnio(undefined)
    setFiltroMes(undefined)
  }

  return (
    <div className="ing-lista">
      {/* Búsqueda + Filtrar en la misma fila */}
      <div className="ing-toolbar">
        <div className="ing-busqueda">
          <span className="ing-busqueda-icono"><IconSearch /></span>
          <input
            type="search"
            placeholder="Buscar por número de OC"
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
          Filtrar
          {filtrosActivos > 0 && <span className="ing-filtrar-badge">{filtrosActivos}</span>}
        </button>
      </div>

      {/* Filtros de estado — siempre visibles */}
      <div className="sal-filtro-estado">
        {(['', 'pendiente', 'parcial', 'completa'] as const).map((e) => (
          <button
            key={e}
            type="button"
            className={`sal-estado-btn ${(filtroEstado ?? '') === e ? 'sal-estado-btn--activo' : ''}`}
            onClick={() => setFiltroEstado(e || undefined)}
          >
            {e ? ESTADO_LABELS[e] : 'Todas'}
          </button>
        ))}
      </div>

      {/* Panel de filtros — se despliega al hacer clic en "Filtrar" */}
      {filtrosAbiertos && (
        <div className="ing-filtros-panel">
          <div className="ing-filtro-grupo">
            <span className="ing-filtro-label">Fecha de OC</span>
            <div className="ing-filtro-opciones">
              <select
                className="ing-filtro-select"
                value={filtroAnio ?? ''}
                onChange={(e) => setFiltroAnio(e.target.value || undefined)}
              >
                <option value="">Año</option>
                {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select
                className="ing-filtro-select"
                value={filtroMes ?? ''}
                onChange={(e) => setFiltroMes(e.target.value || undefined)}
              >
                <option value="">Mes</option>
                {MESES.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                ))}
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

      {/* Ver OC (izquierda) + Nueva importación (derecha) */}
      <div className="ing-veroc-wrap">
        <button className="btn-primario" disabled={!seleccionadaId} onClick={onVerOC}>
          Ver OC
        </button>
        <button className="btn-primario" onClick={onNuevaImportacion}>
          + Nueva importación
        </button>
      </div>

      {isLoading && <p className="cargando">Cargando órdenes…</p>}
      {isError   && <p className="error">Error al cargar importaciones</p>}

      {!isLoading && !isError && resultado.length === 0 && (
        <div className="ing-vacio">
          <p>{busqueda ? `Sin resultados para "${busqueda}"` : 'No hay órdenes de compra'}</p>
        </div>
      )}

      {!isLoading && !isError && resultado.length > 0 && (
        <>
          <p className="ing-conteo">{resultado.length} OC{resultado.length !== 1 ? 's' : ''}</p>
          <div className="ing-lista-scroll">
            <div className="ing-lista-filas">
              {resultado.map((imp: ImportacionResumen) => {
                const marcada = imp.importacionId === seleccionadaId
                return (
                  <div
                    key={imp.importacionId}
                    className={`ing-fila-item ${marcada ? 'ing-fila-item--activa' : ''}`}
                  >
                    <div
                      className="ing-fila"
                      role="button"
                      tabIndex={0}
                      aria-pressed={marcada}
                      onClick={() => onSeleccionar(imp.importacionId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeleccionar(imp.importacionId) }
                      }}
                    >
                      {/* Selección — solo una OC a la vez */}
                      <button
                        type="button"
                        className={`ing-fila-check ${marcada ? 'ing-fila-check--activo' : ''}`}
                        aria-pressed={marcada}
                        aria-label={marcada ? `Quitar selección de ${imp.codigo}` : `Seleccionar ${imp.codigo}`}
                        onClick={(e) => { e.stopPropagation(); onSeleccionar(imp.importacionId) }}
                      >
                        {marcada && <IconCheck />}
                      </button>

                      {/* Código + OC */}
                      <div className="ing-fila-principal">
                        <span className="ing-fila-codigo">{imp.codigo}</span>
                        <span className="ing-fila-oc"><IconDoc /> OC #{imp.numeroOc}</span>
                      </div>

                      {/* Progreso */}
                      <div className="ing-fila-progreso">
                        <span className="ing-progreso-texto">
                          {imp.productosCompletos}/{imp.totalProductos} productos
                        </span>
                      </div>

                      {/* Fecha */}
                      <div className="ing-fila-fecha">
                        <IconCalendar />
                        <span>{formatearFecha(imp.fechaIngreso)}</span>
                      </div>

                      {/* Estado */}
                      <div className="ing-fila-estado">
                        <BadgeEstado estado={imp.estado} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Detalle de OC ─────────────────────────────────────────────────────────

function DetalleOC({
  importacionId,
  onVolver,
  onUbicar,
}: {
  importacionId: string
  onVolver:      () => void
  onUbicar:      (detalle: DetalleImportacion['detalles'][number]) => void
}) {
  const { data, isLoading, isError } = useDetalleImportacion(importacionId)
  const [urlPacking,   setUrlPacking]   = useState<string | null>(null)
  const [modalPacking, setModalPacking] = useState(false)
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [filtroEstadoProd, setFiltroEstadoProd] = useState<'' | 'pendiente' | 'parcial' | 'completa'>('')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  function toggleProducto(detalleId: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(detalleId)) next.delete(detalleId)
      else next.add(detalleId)
      return next
    })
  }

  useEffect(() => {
    if (!data) return
    const año  = data.fechaIngreso.slice(0, 4)
    const base = `${año}/${data.numeroOc}`
    ;(async () => {
      const { data: archivos } = await supabase.storage.from('importaciones').list(base)
      if (!archivos?.length) return
      const encontrado = archivos.find((f) =>
        f.name.toLowerCase().endsWith('.pdf') &&
        !f.name.toLowerCase().startsWith('oc')
      )?.name
      if (!encontrado) return

      const token  = localStorage.getItem('auth_token') ?? ''
      const supaUrl = import.meta.env.VITE_SUPABASE_URL as string
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const resp = await fetch(
        `${supaUrl}/storage/v1/object/authenticated/importaciones/${base}/${encontrado}`,
        { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } }
      )

      if (!resp.ok) return
      const blob = await resp.blob()
      if (blob.size > 0) setUrlPacking(URL.createObjectURL(blob))
    })()
  }, [data])

  if (isLoading) return <p className="cargando">Cargando detalle…</p>
  if (isError || !data) return <p className="error">Error al cargar la OC</p>

  const completosTotal = data.detalles.filter((d) => d.estado === 'completa').length
  const pct = data.detalles.length ? Math.round((completosTotal / data.detalles.length) * 100) : 0

  const qProducto = busquedaProducto.trim().toLowerCase()
  const detallesMostrados = data.detalles
    .filter((d) => !qProducto || d.sku.toLowerCase().includes(qProducto) || d.nombre.toLowerCase().includes(qProducto))
    .filter((d) => {
      if (!filtroEstadoProd) return true
      if (filtroEstadoProd === 'pendiente') return d.estado === 'pendiente'
      if (filtroEstadoProd === 'parcial')   return d.estado === 'parcial'
      if (filtroEstadoProd === 'completa')  return d.estado === 'completa'
      return true
    })

  const pendientes = detallesMostrados.filter((d) => d.estado !== 'completa')
  const completos  = detallesMostrados.filter((d) => d.estado === 'completa')

  return (
    <div className="ing-detalle">

      {modalPacking && urlPacking && (
        <div className="excel-overlay" onClick={() => setModalPacking(false)}>
          <div className="excel-modal" onClick={(e) => e.stopPropagation()} style={{ width: '95vw', maxWidth: '1400px', height: '90vh' }}>
            <div className="excel-header">
              <div className="excel-header-titulo">
                <span>📄</span>
                <h2>Packing List — OC {data.numeroOc}</h2>
              </div>
              <div className="excel-header-acciones">
                <a href={urlPacking} target="_blank" rel="noreferrer" className="btn-secundario excel-btn-descargar">
                  ↓ Descargar
                </a>
                <button className="excel-btn-cerrar" onClick={() => setModalPacking(false)}>✕</button>
              </div>
            </div>
            <div className="excel-body" style={{ padding: 0, flex: 1, minHeight: 0 }}>
              <iframe src={urlPacking} width="100%" height="100%" style={{ border: 'none', display: 'block' }} title="Packing List" />
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="ing-detalle-header">
        <button className="btn-volver" onClick={onVolver}>
          <IconBack /> Volver
        </button>
        <div className="ing-detalle-titulo" />
        <button
          className="btn-secundario"
          disabled={!urlPacking}
          title={urlPacking ? undefined : 'Packing List no disponible'}
          onClick={() => setModalPacking(true)}
        >
          📎 Packing List
        </button>
        <div className="ing-detalle-estado">
          <BadgeEstado estado={data.estado} />
        </div>
      </div>

      {/* Metadata panel */}
      <div className="ing-detalle-meta">
        <div className="ing-meta-item">
          <IconDoc />
          <div>
            <span className="ing-meta-label">Número OC</span>
            <span className="ing-meta-valor">{data.numeroOc}</span>
          </div>
        </div>
        <div className="ing-meta-item">
          <IconCalendar />
          <div>
            <span className="ing-meta-label">Fecha ingreso</span>
            <span className="ing-meta-valor">{formatearFecha(data.fechaIngreso)}</span>
          </div>
        </div>
        <div className="ing-meta-item">
          <IconUser />
          <div>
            <span className="ing-meta-label">Importado por</span>
            <span className="ing-meta-valor">{data.importadoPor}</span>
          </div>
        </div>
        <div className="ing-meta-item ing-meta-item--progreso">
          <IconBox />
          <div>
            <span className="ing-meta-label">Productos</span>
            <span className="ing-meta-valor">{completosTotal}/{data.detalles.length} completados ({pct}%)</span>
          </div>
        </div>
      </div>

      {/* Búsqueda de productos por código o nombre */}
      <div className="ing-busqueda">
        <span className="ing-busqueda-icono"><IconSearch /></span>
        <input
          type="search"
          placeholder="Buscar producto por código o nombre…"
          value={busquedaProducto}
          onChange={(e) => setBusquedaProducto(e.target.value)}
          autoComplete="off"
        />
        {busquedaProducto && (
          <button className="ing-busqueda-limpiar" onClick={() => setBusquedaProducto('')}>✕</button>
        )}
      </div>

      {/* Filtro por estado de producto */}
      <div className="sal-filtro-estado">
        {(['', 'pendiente', 'parcial', 'completa'] as const).map((e) => (
          <button
            key={e}
            type="button"
            className={`sal-estado-btn ${filtroEstadoProd === e ? 'sal-estado-btn--activo' : ''}`}
            onClick={() => setFiltroEstadoProd(e)}
          >
            {e ? ESTADO_LABELS[e] : 'Todos'}
          </button>
        ))}
      </div>

      {(qProducto || filtroEstadoProd) && pendientes.length === 0 && completos.length === 0 && (
        <div className="ing-vacio">
          <p>Sin resultados para "{busquedaProducto}"</p>
        </div>
      )}

      {/* Productos pendientes */}
      {pendientes.length > 0 && (
        <section className="ing-seccion">
          <h3 className="ing-seccion-titulo">
            <span className="ing-seccion-dot ing-seccion-dot--pendiente" />
            Pendientes de ubicar ({pendientes.length})
          </h3>
          <div className="ing-productos-lista">
            {pendientes.map((det) => {
              const pendiente = det.cantidadEsperada - det.cantidadRecibida
              const pctDet    = det.cantidadEsperada ? Math.round((det.cantidadRecibida / det.cantidadEsperada) * 100) : 0
              const abierto   = expandidos.has(det.detalleId)
              return (
                <div key={det.detalleId} className="ing-prod-item">
                  <div
                    className="ing-prod-fila"
                    role="button"
                    tabIndex={0}
                    aria-expanded={abierto}
                    onClick={() => toggleProducto(det.detalleId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProducto(det.detalleId) }
                    }}
                  >
                    <div className="ing-prod-info">
                      <span className="ing-prod-nombre">{det.nombre}</span>
                      <code className="ing-prod-sku">{det.sku}</code>
                    </div>
                    <div className="ing-prod-fila-derecha">
                      <BadgeEstado estado={det.estado} />
                      <span className={`ing-prod-chevron ${abierto ? 'ing-prod-chevron--activo' : ''}`}>
                        <IconChevron />
                      </span>
                    </div>
                  </div>

                  {abierto && (
                    <div className="ing-prod-detalle">
                      <div className="ing-prod-cantidades">
                        <div className="ing-cantidad-item">
                          <span className="ing-cantidad-label">Recibido</span>
                          <span className="ing-cantidad-valor ing-cantidad-valor--recibido">{det.cantidadRecibida}</span>
                        </div>
                        <div className="ing-cantidad-sep">·</div>
                        <div className="ing-cantidad-item">
                          <span className="ing-cantidad-label">Pendiente</span>
                          <span className="ing-cantidad-valor ing-cantidad-valor--pendiente">{pendiente}</span>
                        </div>
                      </div>
                      <div className="ing-prod-barra-wrap">
                        <div className="ing-prod-barra-fill" style={{ width: `${pctDet}%` }} />
                      </div>
                      <button className="btn-primario ing-btn-ubicar" onClick={(e) => { e.stopPropagation(); onUbicar(det) }}>
                        Ubicar producto
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Productos completos */}
      {completos.length > 0 && (
        <section className="ing-seccion">
          <h3 className="ing-seccion-titulo">
            <span className="ing-seccion-dot ing-seccion-dot--completo" />
            Completados ({completos.length})
          </h3>
          <div className="ing-productos-lista">
            {completos.map((det) => {
              const abierto = expandidos.has(det.detalleId)
              return (
                <div key={det.detalleId} className="ing-prod-item">
                  <div
                    className="ing-prod-fila"
                    role="button"
                    tabIndex={0}
                    aria-expanded={abierto}
                    onClick={() => toggleProducto(det.detalleId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProducto(det.detalleId) }
                    }}
                  >
                    <div className="ing-prod-info">
                      <span className="ing-prod-nombre">{det.nombre}</span>
                      <code className="ing-prod-sku">{det.sku}</code>
                    </div>
                    <div className="ing-prod-fila-derecha">
                      {det.ubicacion && (
                        <span className="ing-prod-ubicacion">{det.ubicacion}</span>
                      )}
                      <BadgeEstado estado={det.estado} />
                      <span className={`ing-prod-chevron ${abierto ? 'ing-prod-chevron--activo' : ''}`}>
                        <IconChevron />
                      </span>
                    </div>
                  </div>

                  {abierto && (
                    <div className="ing-prod-detalle">
                      <div className="ing-prod-cantidades">
                        <div className="ing-cantidad-item">
                          <span className="ing-cantidad-label">Recibido</span>
                          <span className="ing-cantidad-valor ing-cantidad-valor--ok">{det.cantidadRecibida}</span>
                        </div>
                        <div className="ing-cantidad-sep">·</div>
                        <div className="ing-cantidad-item">
                          <span className="ing-cantidad-label">Pendiente</span>
                          <span className="ing-cantidad-valor ing-cantidad-valor--ok">{det.cantidadEsperada - det.cantidadRecibida}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────

export function IngresosPage() {
  const ADMIN_ID = localStorage.getItem('user_id') ?? ''
  const { offline } = useConectividad()
  const [vista, setVista]                   = useState<Vista>({ tipo: 'lista' })
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null)
  const [detalleKey, setDetalleKey]         = useState(0)

  const importacionIdActual = vista.tipo === 'detalle' || vista.tipo === 'ubicar'
    ? vista.importacionId : null
  const { data: detalleActual, refetch: refetchDetalle } = useDetalleImportacion(importacionIdActual)

  function volverADetalle(importacionId: string) {
    setDetalleKey((k) => k + 1)
    setVista({ tipo: 'detalle', importacionId })
    setTimeout(() => refetchDetalle(), 100)
  }

  return (
    <div className="ingresos-page">
      <h1 className="ingresos-titulo">
        Importacion en Transito
        {vista.tipo === 'detalle' && detalleActual && (
          <span className="ingresos-titulo-sub"> / {detalleActual.codigo}</span>
        )}
      </h1>

      {offline && (
        <div className="aviso-offline">
          Sin conexión — modo solo lectura. Las operaciones de ubicación requieren WiFi.
        </div>
      )}

      {vista.tipo === 'lista' && (
        <ListaImportaciones
          seleccionadaId={seleccionadaId}
          onSeleccionar={(id) => setSeleccionadaId((cur) => (cur === id ? null : id))}
          onVerOC={() => { if (seleccionadaId) setVista({ tipo: 'detalle', importacionId: seleccionadaId }) }}
          onNuevaImportacion={() => setVista({ tipo: 'seleccionarProveedor' })}
        />
      )}

      {vista.tipo === 'seleccionarProveedor' && (
        <SeleccionProveedor
          onVolver={() => setVista({ tipo: 'lista' })}
          onSeleccionar={(p) => setVista({ tipo: p === 'ylk' ? 'importarYLK' : 'importar' })}
        />
      )}

      {vista.tipo === 'importar' && (
        <ImportarOCFlow
          adminId={ADMIN_ID}
          onVolver={() => setVista({ tipo: 'seleccionarProveedor' })}
          onCreada={(id) => { setSeleccionadaId(id); setVista({ tipo: 'detalle', importacionId: id }) }}
        />
      )}

      {vista.tipo === 'importarYLK' && (
        <ImportarOCFlowYLK
          adminId={ADMIN_ID}
          onVolver={() => setVista({ tipo: 'seleccionarProveedor' })}
          onCreada={(id) => { setSeleccionadaId(id); setVista({ tipo: 'detalle', importacionId: id }) }}
        />
      )}

      {vista.tipo === 'detalle' && (
        <DetalleOC
          key={detalleKey}
          importacionId={vista.importacionId}
          onVolver={() => setVista({ tipo: 'lista' })}
          onUbicar={(det) => setVista({ tipo: 'ubicar', importacionId: vista.importacionId, detalle: det })}
        />
      )}

      {vista.tipo === 'ubicar' && (
        <UbicarDetalleFlow
          detalle={vista.detalle}
          importacionId={vista.importacionId}
          adminId={ADMIN_ID}
          onExito={() => volverADetalle(vista.importacionId)}
          onCerrar={() => volverADetalle(vista.importacionId)}
        />
      )}
    </div>
  )
}
