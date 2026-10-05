import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesionesPicking, useCancelarSesion } from '../hooks/usePickingMasivo'
import { useOlas, useCancelarOla } from '../hooks/useOlas'
import { useRealtimeSesiones } from '../hooks/useRealtimePicking'
import type { SesionResumen } from '../services/picking-masivo.api'
import type { OlaResumen } from '../services/olas.api'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type EstadoAdmin = 'libre' | 'en_proceso' | 'completada' | 'despachada' | 'cancelada' | 'validando'
type FiltroEstado = EstadoAdmin | 'todas'

type FilaUnificada = {
  id:          string
  tipo:        'sesion' | 'ola'
  cliente:     string
  oc:          string | null
  entrega:     string
  completados: number
  total:       number
  estado:      EstadoAdmin
  creadoEn:    string
  creadoPor:   string | null
}

function derivarEstado(s: SesionResumen): EstadoAdmin {
  if (s.estado === 'cancelada')  return 'cancelada'
  if (s.estado === 'despachado') return 'despachada'
  if (s.estado === 'completada') return 'completada'
  if (s.estado === 'validando')  return 'validando'
  if (s.estado === 'en_proceso') return 'en_proceso'
  return 'en_proceso'
}

function derivarEstadoOla(o: OlaResumen): EstadoAdmin {
  if (o.estado === 'cancelada')      return 'cancelada'
  if (o.estado === 'despachada')     return 'despachada'
  if (o.estado === 'completada')     return 'completada'
  if (o.estado === 'validando')      return 'validando'
  if (o.estado === 'en_extraccion')  return 'en_proceso'
  if (o.estado === 'en_preparacion') return 'en_proceso'
  return 'en_proceso'
}

function normalizarSesion(s: SesionResumen): FilaUnificada {
  return {
    id:          s.id,
    tipo:        'sesion',
    cliente:     s.nombre_cliente ?? '—',
    oc:          s.numero_oc_pedido ?? null,
    entrega:     s.numero_oc,
    completados: s.items_completados,
    total:       s.total_items,
    estado:      derivarEstado(s),
    creadoEn:    s.creado_en,
    creadoPor:   s.creado_por_usuario?.nombre ?? null,
  }
}

function normalizarOla(o: OlaResumen): FilaUnificada {
  const proveedor = o.proveedor.charAt(0).toUpperCase() + o.proveedor.slice(1)
  const completados =
    o.estado === 'completada' || o.estado === 'despachada' ? o.total_lineas : 0
  // Convertir YYYY-MM-DD → DD-MM-YYYY para compatibilidad con urgenciaBadge
  let entrega = '—'
  if (o.fecha_entrega) {
    const parts = o.fecha_entrega.split('-')
    entrega = parts.length === 3 && parts[0].length === 4
      ? `${parts[2]}-${parts[1]}-${parts[0]}`
      : o.fecha_entrega
  }
  return {
    id:          o.id,
    tipo:        'ola',
    cliente:     proveedor,
    oc:          null,
    entrega,
    completados,
    total:       o.total_lineas,
    estado:      derivarEstadoOla(o),
    creadoEn:    o.creado_en,
    creadoPor:   o.creado_por_usuario?.nombre ?? null,
  }
}

const ESTADO_CFG: Record<EstadoAdmin, { label: string; cls: string; dot: string }> = {
  libre:      { label: 'EN PROCESO',    cls: 'pm-badge--proceso',    dot: '#22c55e' },
  en_proceso: { label: 'EN PROCESO',    cls: 'pm-badge--proceso',    dot: '#22c55e' },
  completada: { label: 'REQUIERE VALIDACIÓN', cls: 'pm-badge--validacion', dot: '#f59e0b' },
  despachada: { label: 'DESPACHADA',    cls: 'pm-badge--despachada', dot: '#a78bfa' },
  cancelada:  { label: 'CANCELADA',     cls: 'pm-badge--cancelada',  dot: '#f87171' },
  validando:  { label: 'VALIDANDO',     cls: 'pm-badge--validando',  dot: '#94a3b8' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// numero_oc guarda la fecha de entrega en formato "DD-MM-YYYY"
function parseFechaEntrega(ddmmyyyy: string): Date | null {
  const [d, m, y] = ddmmyyyy.split('-')
  if (!d || !m || !y) return null
  return new Date(Number(y), Number(m) - 1, Number(d))
}

function hoyStr() {
  const h = new Date()
  return `${String(h.getDate()).padStart(2, '0')}-${String(h.getMonth() + 1).padStart(2, '0')}-${h.getFullYear()}`
}

function urgenciaBadge(ddmmyyyy: string): { label: string; cls: string } | null {
  const entrega = parseFechaEntrega(ddmmyyyy)
  if (!entrega) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const man = new Date(hoy); man.setDate(man.getDate() + 1)
  entrega.setHours(0, 0, 0, 0)
  if (entrega.getTime() === hoy.getTime()) return { label: 'HOY',    cls: 'pm-urgencia--hoy' }
  if (entrega.getTime() === man.getTime()) return { label: 'MAÑANA', cls: 'pm-urgencia--manana' }
  if (entrega < hoy) return { label: 'VENCIDA', cls: 'pm-urgencia--vencida' }
  return null
}

function fmtFecha(iso: string | null) {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().join('-')
}

// ── Barra de progreso ─────────────────────────────────────────────────────────

function ProgressBar({ pct, alerta }: { pct: number; alerta: boolean }) {
  const color = alerta ? '#f59e0b' : '#00A0DF'
  return (
    <div className="pm-t-barra-bg">
      <div className="pm-t-barra-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}

// ── Menú contextual ───────────────────────────────────────────────────────────

function MenuContextual({ onCancelar }: { onCancelar: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="pm-t-menu-wrap" ref={ref}>
      <button className="pm-t-btn pm-t-btn--gear" onClick={() => setOpen(o => !o)} title="Más opciones">
        ⚙
      </button>
      {open && (
        <div className="pm-t-menu-dropdown">
          <button
            className="pm-t-menu-item pm-t-menu-item--danger"
            onClick={() => { setOpen(false); onCancelar() }}
          >
            🚫 Cancelar sesión
          </button>
        </div>
      )}
    </div>
  )
}

// ── Fila unificada ────────────────────────────────────────────────────────────

function OlaFila({
  fila,
  onMonitorear,
  onCancelar,
}: {
  fila: FilaUnificada
  onMonitorear: () => void
  onCancelar: () => void
}) {
  const cfg         = ESTADO_CFG[fila.estado]
  const pct         = fila.total > 0 ? Math.round((fila.completados / fila.total) * 100) : 0
  const udsTxt      = `${fila.completados.toLocaleString('es-CL')} / ${fila.total.toLocaleString('es-CL')} ${fila.tipo === 'sesion' ? 'Uds' : 'líneas'}`
  const badge       = urgenciaBadge(fila.entrega)
  const esHoy       = badge?.label === 'HOY'
  const alerta      = esHoy && pct < 50
  const cancelable  = fila.estado === 'libre' || fila.estado === 'validando' || fila.estado === 'en_proceso'
  const accionLabel = fila.estado === 'despachada' || fila.estado === 'cancelada' ? 'Ver detalle' : 'Ver'

  return (
    <tr className={`pm-t-fila pm-t-fila--${fila.estado}`}>

      {/* Identificación */}
      <td className="pm-t-td pm-t-td--id">
        <span className="pm-t-cliente">{fila.cliente}</span>
        {fila.oc && (
          <span className="pm-t-oc">OC {fila.oc}</span>
        )}
      </td>

      {/* Progreso */}
      <td className="pm-t-td pm-t-td--prog">
        <div className="pm-t-prog-wrap">
          <div className="pm-t-prog-header">
            <span className="pm-t-uds">{udsTxt}</span>
            <span className={`pm-t-pct${alerta ? ' pm-t-pct--alerta' : ''}`}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} alerta={alerta} />
        </div>
      </td>

      {/* Entrega */}
      <td className="pm-t-td pm-t-td--entrega">
        <span className="pm-t-fecha-entrega">{fila.entrega}</span>
      </td>

      {/* Creación */}
      <td className="pm-t-td pm-t-td--creacion">
        <span className="pm-t-fecha-creacion">{fmtFecha(fila.creadoEn)}</span>
        {fila.creadoPor && (
          <span className="pm-t-creador">{fila.creadoPor}</span>
        )}
      </td>

      {/* Estado */}
      <td className="pm-t-td pm-t-td--estado">
        <span className={`pm-admin-badge ${cfg.cls}`}>
          <span className="pm-admin-badge-dot" style={{ background: cfg.dot }} />
          {cfg.label}
        </span>
      </td>

      {/* Acciones */}
      <td className="pm-t-td pm-t-td--acciones">
        <div className="pm-t-acciones">
          <button className="pm-t-btn pm-t-btn--monitor" onClick={onMonitorear} title={accionLabel}>
            👁 {accionLabel}
          </button>
          {cancelable && (
            <MenuContextual onCancelar={onCancelar} />
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export function PickingMasivoPage() {
  const navigate  = useNavigate()
  const ROL       = localStorage.getItem('user_rol') ?? ''
  const [busqueda, setBusqueda]     = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todas')
  const [confirmCancelar, setConfirmCancelar] = useState<{ id: string; tipo: 'sesion' | 'ola' } | null>(null)

  const { data: dataSesiones, isLoading: loadSes, isError: errSes } = useSesionesPicking()
  const { data: dataOlas,     isLoading: loadOlas, isError: errOlas } = useOlas()
  const cancelarSesion = useCancelarSesion()
  const cancelarOla    = useCancelarOla()
  useRealtimeSesiones()

  const isLoading = loadSes || loadOlas
  const isError   = errSes  || errOlas

  // Unificar ambas fuentes
  const filas: FilaUnificada[] = [
    ...(dataSesiones ?? []).map(normalizarSesion),
    ...(dataOlas     ?? []).map(normalizarOla),
  ].sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime())

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const enProceso   = filas.filter(f => f.estado === 'en_proceso' || f.estado === 'validando')
  const completadas = filas.filter(f => f.estado === 'completada' || f.estado === 'despachada')

  // ── Filtros ───────────────────────────────────────────────────────────────
  const filtradas = filas.filter(f => {
    const q = busqueda.toLowerCase()
    const matchBusq = !q ||
      f.cliente.toLowerCase().includes(q) ||
      (f.oc ?? '').toLowerCase().includes(q) ||
      f.entrega.toLowerCase().includes(q)

    const matchFecha = !filtroFecha || (() => {
      const [y, m, d] = filtroFecha.split('-')
      return f.entrega === `${d}-${m}-${y}`
    })()

    const matchEstado = filtroEstado === 'todas' ||
      f.estado === filtroEstado ||
      (filtroEstado === 'completada' && f.estado === 'despachada')

    return matchBusq && matchFecha && matchEstado
  })

  function handleCancelar(id: string, tipo: 'sesion' | 'ola') {
    if (tipo === 'sesion') {
      cancelarSesion.mutate(id, { onSuccess: () => setConfirmCancelar(null) })
    } else {
      cancelarOla.mutate(id, { onSuccess: () => setConfirmCancelar(null) })
    }
  }

  function handleMonitorear(fila: FilaUnificada) {
    if (fila.tipo === 'ola') {
      navigate(`/picking-masivo/ola/${fila.id}`)
    } else {
      navigate(`/picking-masivo/${fila.id}`)
    }
  }

  function toggleFiltro(f: FiltroEstado) {
    setFiltroEstado(cur => cur === f ? 'todas' : f)
  }

  // Vista operador
  if (ROL === 'operador') {
    return (
      <div className="notas-page">
        <div className="notas-vacio">
          <p>Ve a <button className="btn-link" onClick={() => navigate('/picking-masivo/operador')}>Sesiones disponibles</button></p>
        </div>
      </div>
    )
  }

  return (
    <div className="pm-admin-wrap">

      {/* ── Cabecera ── */}
      <div className="pm-admin-top">
        <h1 className="pm-admin-titulo">Gestión de Picking Masivo</h1>
        {ROL === 'admin' && (
          <button className="btn-primario pm-admin-nueva-btn" onClick={() => navigate('/picking-masivo/nueva')}>
            ➕ Nueva Sesión
          </button>
        )}
      </div>

      {/* ── KPIs ── */}
      <div className="pm-admin-kpis">
        <button
          className={`pm-admin-kpi ${filtroEstado === 'todas' ? 'pm-admin-kpi--activo' : ''}`}
          onClick={() => setFiltroEstado('todas')}
        >
          <span className="pm-admin-kpi-val">{filas.length}</span>
          <span className="pm-admin-kpi-label">TODAS</span>
        </button>

        <button
          className={`pm-admin-kpi pm-admin-kpi--proceso ${filtroEstado === 'en_proceso' ? 'pm-admin-kpi--activo' : ''}`}
          onClick={() => toggleFiltro('en_proceso')}
        >
          <span className="pm-admin-kpi-val">{enProceso.length}</span>
          <span className="pm-admin-kpi-label">EN PROCESO</span>
        </button>

        <button
          className={`pm-admin-kpi pm-admin-kpi--completadas ${filtroEstado === 'completada' ? 'pm-admin-kpi--activo' : ''}`}
          onClick={() => toggleFiltro('completada')}
        >
          <span className="pm-admin-kpi-val">{completadas.length}</span>
          <span className="pm-admin-kpi-label">COMPLETADAS</span>
        </button>
      </div>

      {/* ── Búsqueda y fecha ── */}
      <div className="pm-admin-search-row">
        <div className="pm-admin-search-wrap">
          <span className="pm-admin-search-ico">🔍</span>
          <input
            className="pm-admin-search"
            placeholder="Buscar por proveedor, cliente, OC o fecha…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
          {busqueda && (
            <button className="pm-admin-search-clear" onClick={() => setBusqueda('')}>✕</button>
          )}
        </div>

        <div className="pm-t-fecha-wrap">
          <label className="pm-t-fecha-label">Fecha entrega</label>
          <input
            type="date"
            className="pm-t-fecha-input"
            value={filtroFecha}
            onChange={e => setFiltroFecha(e.target.value)}
          />
          {filtroFecha && (
            <button className="pm-admin-search-clear pm-t-fecha-clear" onClick={() => setFiltroFecha('')}>✕</button>
          )}
        </div>

        {filtroEstado !== 'todas' && (
          <button className="pm-admin-filtro-chip" onClick={() => setFiltroEstado('todas')}>
            {ESTADO_CFG[filtroEstado as EstadoAdmin].label} ✕
          </button>
        )}
      </div>

      {/* ── Carga / error ── */}
      {isLoading && <p className="cargando">Cargando sesiones…</p>}
      {isError   && <p className="error-msg">Error al cargar sesiones</p>}

      {/* ── Tabla ── */}
      {!isLoading && !isError && (
        filtradas.length === 0 ? (
          <div className="notas-vacio">
            <p>{busqueda || filtroFecha || filtroEstado !== 'todas' ? 'Sin resultados para ese filtro' : 'No hay sesiones de picking masivo'}</p>
          </div>
        ) : (
          <div className="pm-t-tabla-wrap">
            <table className="pm-t-tabla">
              <thead>
                <tr className="pm-t-thead-tr">
                  <th className="pm-t-th pm-t-th--id">Cliente / Proveedor</th>
                  <th className="pm-t-th pm-t-th--prog">Progreso</th>
                  <th className="pm-t-th pm-t-th--entrega">Entrega</th>
                  <th className="pm-t-th pm-t-th--creacion">Creación</th>
                  <th className="pm-t-th pm-t-th--estado">Estado</th>
                  <th className="pm-t-th pm-t-th--acciones">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(f => (
                  <OlaFila
                    key={`${f.tipo}-${f.id}`}
                    fila={f}
                    onMonitorear={() => handleMonitorear(f)}
                    onCancelar={() => setConfirmCancelar({ id: f.id, tipo: f.tipo })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Modal cancelar ── */}
      {confirmCancelar && (
        <div className="modal-overlay" onClick={() => setConfirmCancelar(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="modal-titulo">¿Cancelar {confirmCancelar.tipo === 'ola' ? 'ola' : 'sesión'}?</h2>
            <p className="modal-desc">Esta acción no se puede deshacer. Las tareas en progreso quedarán liberadas.</p>
            <div className="modal-acciones">
              <button className="btn-secundario" onClick={() => setConfirmCancelar(null)}>Volver</button>
              <button
                className="btn-peligro"
                disabled={cancelarSesion.isPending || cancelarOla.isPending}
                onClick={() => handleCancelar(confirmCancelar.id, confirmCancelar.tipo)}
              >
                {(cancelarSesion.isPending || cancelarOla.isPending) ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
