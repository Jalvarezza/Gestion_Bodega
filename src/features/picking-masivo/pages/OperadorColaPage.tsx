import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useColaSubtareas, useLiberarPropias, useSesionPicking, useTomarSubtarea } from '../hooks/usePickingMasivo'
import { useRealtimeSesion } from '../hooks/useRealtimePicking'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import type { SubtareaResumen } from '../services/picking-masivo.api'

// ── Íconos ────────────────────────────────────────────────────────────────────

function IcoBack() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="15 18 9 12 15 6"/></svg>
}
function IcoUnlock() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
}
function IcoPin() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
}
function IcoScan() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="7" y2="12.01"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="17" y1="12" x2="17" y2="12.01"/></svg>
}
function IcoBarcode() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/></svg>
}
function IcoCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polyline points="20 6 9 17 4 12"/></svg>
}
function IcoLock() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
}

// ── Tarjeta de subtarea (formato admin) ───────────────────────────────────────

function SubtareaCard({
  sub,
  operadorId,
  sesionId,
  tomandoId,
  onTomar,
}: {
  sub: SubtareaResumen
  operadorId: string
  sesionId: string
  tomandoId: string | null
  onTomar: (sub: SubtareaResumen) => void
}) {
  const navigate = useNavigate()
  const [expandido, setExpandido] = useState(false)

  const esMia          = sub.estado === 'bloqueado' && sub.bloqueado_por === operadorId
  const bloqueadaXOtro = sub.estado === 'bloqueado' && sub.bloqueado_por !== operadorId
  const esParcial      = sub.estado === 'parcial' || sub.estado === 'sin_stock'
  const esCompleta     = sub.estado === 'completado'

  const item = sub.items_picking_masivo
  const desc = item?.descripcion ?? item?.codigo ?? '—'
  const sku  = item?.codigo ?? '—'
  const ean  = item?.codigo_barra ?? null
  const rack = sub.posicion_codigo && sub.posicion_codigo !== '—' ? sub.posicion_codigo : 'S/U'
  const total = sub.cantidad_asignada

  let badgeLabel = 'Libre'
  let badgeCls   = 'sd-badge--libre'
  if (esMia)          { badgeLabel = 'En Proceso (Tú)'; badgeCls = 'sd-badge--proceso' }
  if (bloqueadaXOtro) { badgeLabel = 'Ocupada';         badgeCls = 'sd-badge--proceso' }
  if (esParcial)      { badgeLabel = 'Parcial';          badgeCls = 'sd-badge--parcial' }
  if (esCompleta)     { badgeLabel = 'Completado';       badgeCls = 'sd-badge--ok' }

  const cardMod = esCompleta ? 'sd-item-card--completado'
    : esMia          ? 'sd-item-card--en-progreso'
    : bloqueadaXOtro ? 'sd-item-card--bloqueado'
    : esParcial      ? 'sd-item-card--parcial'
    : 'sd-item-card--libre'

  return (
    <div className={`sd-item-card ext-tarea-card ${cardMod}`}>

      {/* ── Cabecera ── */}
      <div className="ext-tarea-header" onClick={() => item?.lpn && setExpandido(v => !v)}
        style={{ cursor: item?.lpn ? 'pointer' : 'default' }}>

        {/* Nombre + SKU + EAN + posición */}
        <div className="ext-tarea-info">
          <span className="ext-tarea-sku">{desc}</span>
          <span className="ext-tarea-ean">
            <span className="ext-tarea-ean-label">SKU</span>
            {sku}
            {ean && (
              <>
                <span className="ext-tarea-ean-label" style={{ marginLeft: 8 }}>EAN</span>
                {ean}
              </>
            )}
            {rack !== 'S/U' && (
              <span style={{ marginLeft: 8, color: 'var(--accent)', fontFamily: 'inherit', fontWeight: 600 }}>
                <IcoPin /> {rack}
              </span>
            )}
          </span>
        </div>

        {/* Cantidad */}
        <div className="ext-tarea-cant">
          <span className="ext-tarea-cant-num">{total}</span>
          <span className="ext-tarea-cant-unit">Uds</span>
        </div>

        {/* Acciones */}
        <div className="ext-tarea-actions" onClick={e => e.stopPropagation()}>
          {esCompleta ? (
            <span className="sd-badge sd-badge--ok"><IcoCheck /> Listo</span>
          ) : bloqueadaXOtro ? (
            <span className="sd-badge sd-badge--proceso"><IcoLock /> Ocupado</span>
          ) : esMia ? (
            <button
              className="sd-accion-btn sd-accion-btn--picking"
              onClick={() => navigate(`/picking-masivo/operador/${sesionId}/confirmar/${sub.id}`)}
            >
              <IcoScan /> Picking
            </button>
          ) : (
            <button
              className="sd-accion-btn sd-accion-btn--picking"
              disabled={tomandoId === sub.id}
              onClick={() => onTomar(sub)}
            >
              {tomandoId === sub.id ? 'Tomando…' : 'Tomar'}
            </button>
          )}
        </div>
      </div>

      {/* ── LPN expandible ── */}
      {expandido && item?.lpn && (
        <div className="ext-tarea-body">
          <div className="ext-ruta">
            <span className="ext-ruta-label">LPN Destino</span>
            <div className="ext-ruta-chips">
              <span className="ext-ruta-chip">{item.lpn}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export function OperadorColaPage() {
  const { id }      = useParams<{ id: string }>()
  const navigate    = useNavigate()
  const sesionId    = id ?? null
  const operadorId  = localStorage.getItem('user_id')  ?? ''

  const { data, isLoading, isError } = useColaSubtareas(sesionId)
  const { data: sesion }             = useSesionPicking(sesionId)
  useRealtimeSesion(sesionId)
  const tomarSubtarea  = useTomarSubtarea(sesionId ?? '')
  const liberarPropias = useLiberarPropias(sesionId ?? '')

  const [tomandoId, setTomandoId] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [filtro, setFiltro]       = useState<'todas' | 'mias' | 'tomadas' | 'parcial' | 'completas'>('todas')
  const [busqueda, setBusqueda]   = useState('')

  const subtareas    = data ?? []
  const tengoPropias = subtareas.some(s => s.estado === 'bloqueado' && s.bloqueado_por === operadorId)

  const cntTodas    = subtareas.filter(s => s.estado !== 'completado').length
  const cntMias     = subtareas.filter(s => s.estado === 'bloqueado' && s.bloqueado_por === operadorId).length
  const cntTomadas  = subtareas.filter(s => s.estado === 'bloqueado' && s.bloqueado_por !== operadorId).length
  const cntParcial  = subtareas.filter(s => s.estado === 'parcial' || s.estado === 'sin_stock').length
  const cntCompletas= subtareas.filter(s => s.estado === 'completado').length

  const visibles = subtareas
    .filter(s => {
      if (filtro === 'todas')     return s.estado !== 'completado'
      if (filtro === 'mias')      return s.estado === 'bloqueado' && s.bloqueado_por === operadorId
      if (filtro === 'tomadas')   return s.estado === 'bloqueado' && s.bloqueado_por !== operadorId
      if (filtro === 'parcial')   return s.estado === 'parcial' || s.estado === 'sin_stock'
      if (filtro === 'completas') return s.estado === 'completado'
      return true
    })
    .filter(s => {
      const q = busqueda.trim().toLowerCase()
      if (!q) return true
      const item = s.items_picking_masivo
      return (item?.codigo ?? '').toLowerCase().includes(q) ||
             (item?.descripcion ?? '').toLowerCase().includes(q) ||
             (item?.codigo_barra ?? '').toLowerCase().includes(q)
    })
    .slice()
    .sort((a, b) => (a.items_picking_masivo?.lpn ?? '').localeCompare(b.items_picking_masivo?.lpn ?? '', undefined, { numeric: true }))

  async function handleTomar(sub: SubtareaResumen) {
    if (!sesionId) return
    setError(null)
    setTomandoId(sub.id)
    try {
      await tomarSubtarea.mutateAsync({ subtareaId: sub.id, usuarioId: operadorId })
      navigate(`/picking-masivo/operador/${sesionId}/confirmar/${sub.id}`)
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'No se pudo tomar la subtarea')
    } finally {
      setTomandoId(null)
    }
  }

  async function handleLiberar() {
    if (!sesionId) return
    setError(null)
    await liberarPropias.mutateAsync({ sesionId, usuarioId: operadorId })
  }

  const pct      = sesion && sesion.total_items > 0
    ? Math.round((sesion.items_completados / sesion.total_items) * 100)
    : 0
  const oc       = sesion?.numero_oc_pedido ?? sesion?.numero_oc ?? ''
  const cliente  = sesion?.nombre_cliente ?? oc

  return (
    <div className="sd-page sd-page--operador">

      {/* ── Cabecera ── */}
      <div className="sd-header">
        <button className="sd-volver-btn" onClick={() => navigate('/picking-masivo/operador')}>
          <IcoBack /> Volver
        </button>
        <div className="sd-header-title">
          <div className="sd-header-nombre-row">
            <span className="sd-header-nombre">{cliente}</span>
          </div>
          {oc && sesion?.nombre_cliente && (
            <div className="sd-header-meta">
              <span className="sd-header-oc">OC: {oc}</span>
            </div>
          )}
        </div>
        <div className="sd-header-actions">
          <button
            className="sd-btn sd-btn--secondary"
            disabled={!tengoPropias || liberarPropias.isPending}
            onClick={handleLiberar}
          >
            <IcoUnlock />
            {liberarPropias.isPending ? 'Liberando…' : 'Liberar mis tareas'}
          </button>
        </div>
      </div>

      {/* ── Barra de progreso ── */}
      {sesion && (
        <div className="cola-progreso-wrap">
          <div className="cola-progreso-meta">
            <span className="cola-progreso-label">PROGRESO DEL LOTE</span>
            <span className="cola-progreso-ratio">
              {sesion.items_completados} / {sesion.total_items} productos · {pct}%
            </span>
          </div>
          <div className="cola-progreso-bg">
            <div className="cola-progreso-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {error && <div className="sd-error-banner">{error}</div>}

      {/* ── Búsqueda + Filtros ── */}
      <div className="sd-toolbar oc-toolbar">
        <div className="oc-busqueda-wrap" style={{ position: 'relative' }}>
          <span className="oc-busqueda-ico"><IcoBarcode /></span>
          <input
            type="search"
            className="sd-busqueda oc-busqueda-con-ico"
            placeholder="Buscar por SKU, nombre o escanear EAN…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="sd-filtros">
          {([
            ['todas',     `Todas (${cntTodas})`],
            ['mias',      `Mis Tareas (${cntMias})`],
            ['tomadas',   `Ocupadas (${cntTomadas})`],
            ['parcial',   `Parcial (${cntParcial})`],
            ['completas', `Completas (${cntCompletas})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              className={`sd-filtro-btn ${filtro === key ? 'sd-filtro-btn--activo' : ''}`}
              onClick={() => setFiltro(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Lista ── */}
      {isLoading && <p className="cargando">Cargando cola…</p>}
      {isError   && <p className="error-msg">Error al cargar la cola</p>}
      {!isLoading && !isError && visibles.length === 0 && (
        <div className="sd-vacio">Sin tareas para este filtro</div>
      )}

      {!isLoading && !isError && visibles.length > 0 && (
        <div className="sd-items-lista">
          {visibles.map(sub => (
            <SubtareaCard
              key={sub.id}
              sub={sub}
              operadorId={operadorId}
              sesionId={sesionId ?? ''}
              tomandoId={tomandoId}
              onTomar={handleTomar}
            />
          ))}
        </div>
      )}
    </div>
  )
}
