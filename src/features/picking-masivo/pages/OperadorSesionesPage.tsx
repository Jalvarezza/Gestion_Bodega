import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesionesPicking } from '../hooks/usePickingMasivo'
import { useOlas } from '../hooks/useOlas'
import { useRealtimeSesiones } from '../hooks/useRealtimePicking'
import type { SesionResumen } from '../services/picking-masivo.api'
import type { OlaResumen } from '../services/olas.api'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type EstadoOp = 'en_proceso' | 'completada' | 'despachada'

type FilaOp = {
  id:          string
  tipo:        'sesion' | 'ola'
  cliente:     string
  oc:          string | null
  entrega:     string
  completados: number
  total:       number
  unidad:      string
  estado:      EstadoOp
}

const ESTADO_CFG: Record<EstadoOp, { label: string; cls: string; dot: string }> = {
  en_proceso: { label: 'EN PROCESO', cls: 'pm-badge--proceso',    dot: '#22c55e' },
  completada: { label: 'COMPLETADA', cls: 'pm-badge--completada', dot: '#38bdf8' },
  despachada: { label: 'DESPACHADA', cls: 'pm-badge--despachada', dot: '#a78bfa' },
}

// ── Normalización ─────────────────────────────────────────────────────────────

function normalizarSesion(s: SesionResumen): FilaOp {
  return {
    id:          s.id,
    tipo:        'sesion',
    cliente:     s.nombre_cliente ?? '—',
    oc:          s.numero_oc_pedido ?? null,
    entrega:     s.numero_oc,
    completados: s.items_completados,
    total:       s.total_items,
    unidad:      'Uds',
    estado:      'en_proceso',
  }
}

function normalizarOla(o: OlaResumen): FilaOp {
  const proveedor   = o.proveedor.charAt(0).toUpperCase() + o.proveedor.slice(1)
  const completados = o.estado === 'completada' || o.estado === 'despachada' ? o.total_lineas : 0
  let entrega = '—'
  if (o.fecha_entrega) {
    const parts = o.fecha_entrega.split('-')
    entrega = parts.length === 3 && parts[0].length === 4
      ? `${parts[2]}-${parts[1]}-${parts[0]}`
      : o.fecha_entrega
  }
  const estado: EstadoOp = o.estado === 'despachada' ? 'despachada'
    : o.estado === 'completada' ? 'completada'
    : 'en_proceso'
  return {
    id: o.id,
    tipo: 'ola',
    cliente: proveedor,
    oc: null,
    entrega,
    completados,
    total: o.total_lineas,
    unidad: 'líneas',
    estado,
  }
}

// ── Barra de progreso ─────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="pm-t-barra-bg">
      <div className="pm-t-barra-fill" style={{ width: `${Math.min(100, pct)}%`, background: '#00A0DF' }} />
    </div>
  )
}

// ── Íconos ────────────────────────────────────────────────────────────────────

function IcoBuscar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function IcoJoin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
      <polyline points="10 17 15 12 10 7"/>
      <line x1="15" y1="12" x2="3" y2="12"/>
    </svg>
  )
}

// ── Fila de tabla ─────────────────────────────────────────────────────────────

function FilaOp({ fila }: { fila: FilaOp }) {
  const navigate = useNavigate()
  const pct      = fila.total > 0 ? Math.round((fila.completados / fila.total) * 100) : 0
  const cfg      = ESTADO_CFG[fila.estado]
  const udsTxt   = `${fila.completados.toLocaleString('es-CL')} / ${fila.total.toLocaleString('es-CL')} ${fila.unidad}`

  function handleUnirse() {
    if (fila.tipo === 'ola') navigate(`/picking-masivo/ola/${fila.id}`)
    else navigate(`/picking-masivo/operador/${fila.id}`)
  }

  return (
    <tr className={`pm-t-fila pm-t-fila--${fila.estado === 'en_proceso' ? 'en_proceso' : fila.estado}`}>

      {/* Cliente / Proveedor */}
      <td className="pm-t-td pm-t-td--id">
        <span className="pm-t-cliente">{fila.cliente}</span>
        {fila.oc && <span className="pm-t-oc">OC {fila.oc}</span>}
      </td>

      {/* Progreso */}
      <td className="pm-t-td pm-t-td--prog">
        <div className="pm-t-prog-wrap">
          <div className="pm-t-prog-header">
            <span className="pm-t-uds">{udsTxt}</span>
            <span className="pm-t-pct">{pct}%</span>
          </div>
          <ProgressBar pct={pct} />
        </div>
      </td>

      {/* Entrega */}
      <td className="pm-t-td pm-t-td--entrega">
        <span className="pm-t-fecha-entrega">{fila.entrega}</span>
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
        <button
          className="pm-t-btn pm-t-btn--monitor"
          disabled={fila.estado === 'completada' || fila.estado === 'despachada'}
          onClick={handleUnirse}
        >
          <IcoJoin /> Unirse a Picking
        </button>
      </td>
    </tr>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export function OperadorSesionesPage() {
  const [busqueda, setBusqueda] = useState('')
  const { data: dataSes,  isLoading: loadSes,  isError: errSes  } = useSesionesPicking('en_proceso')
  const { data: dataOlas, isLoading: loadOlas, isError: errOlas } = useOlas()
  useRealtimeSesiones()

  const isLoading = loadSes || loadOlas
  const isError   = errSes  || errOlas

  const sesiones = (dataSes ?? []).map(normalizarSesion)
  const olas     = (dataOlas ?? [])
    .filter(o => o.estado === 'en_extraccion' || o.estado === 'en_preparacion' || o.estado === 'completada')
    .map(normalizarOla)

  const filas: FilaOp[] = [...olas, ...sesiones]

  const q = busqueda.toLowerCase()
  const filtradas = !q ? filas : filas.filter(f =>
    f.cliente.toLowerCase().includes(q) ||
    (f.oc ?? '').toLowerCase().includes(q) ||
    f.entrega.includes(q)
  )

  return (
    <div className="pm-admin-wrap">

      {/* ── Cabecera ── */}
      <div className="pm-admin-header">
        <h1 className="pm-admin-titulo">Sesiones de Picking Masivo</h1>
      </div>

      {/* ── Búsqueda ── */}
      <div className="pm-admin-search-row">
        <div className="pm-admin-search-wrap">
          <span className="pm-admin-search-ico"><IcoBuscar /></span>
          <input
            className="pm-admin-search"
            placeholder="Buscar por cliente o proveedor…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
          {busqueda && (
            <button className="pm-admin-search-clear" onClick={() => setBusqueda('')}>✕</button>
          )}
        </div>
      </div>

      {/* ── Estados ── */}
      {isLoading && <p className="cargando">Cargando sesiones…</p>}
      {isError   && <p className="error-msg">Error al cargar sesiones</p>}
      {!isLoading && !isError && filtradas.length === 0 && (
        <div className="notas-vacio">
          <p>{busqueda ? 'Sin resultados para esa búsqueda' : 'No hay sesiones activas en este momento'}</p>
        </div>
      )}

      {/* ── Tabla ── */}
      {!isLoading && !isError && filtradas.length > 0 && (
        <div className="pm-t-tabla-wrap">
          <table className="pm-t-tabla">
            <thead>
              <tr className="pm-t-thead-tr">
                <th className="pm-t-th pm-t-th--id">Cliente / Proveedor</th>
                <th className="pm-t-th pm-t-th--prog">Progreso</th>
                <th className="pm-t-th pm-t-th--entrega">Entrega</th>
                <th className="pm-t-th pm-t-th--estado">Estado</th>
                <th className="pm-t-th pm-t-th--acciones">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(f => (
                <FilaOp key={`${f.tipo}-${f.id}`} fila={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
