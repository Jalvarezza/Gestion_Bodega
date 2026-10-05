import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useOla,
  useColaExtraccion,
  useTomarTarea,
  useLiberarPropiasExtraccion,
} from '../hooks/useOlas'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import type { TareaExtraccion } from '../services/olas.api'

// ─── Íconos ───────────────────────────────────────────────────────────────────

function IcoBack() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
}
function IcoUnlock() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
}
function IcoCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polyline points="20 6 9 17 4 12"/></svg>
}
function IcoLock() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
}
function IcoPin() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
}

function fmtDt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const dd = d.getDate().toString().padStart(2, '0')
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const hh = d.getHours().toString().padStart(2, '0')
  const mi = d.getMinutes().toString().padStart(2, '0')
  return `${dd}-${mm} ${hh}:${mi}`
}

// ─── Tarjeta de tarea ─────────────────────────────────────────────────────────

function TareaCard({
  tarea,
  operadorId,
  olaId,
  tomandoId,
  onTomar,
}: {
  tarea:      TareaExtraccion
  operadorId: string
  olaId:      string
  tomandoId:  string | null
  onTomar:    (tarea: TareaExtraccion) => void
}) {
  const navigate = useNavigate()

  const esMia          = tarea.estado === 'bloqueado' && tarea.bloqueado_por === operadorId
  const bloqueadaXOtro = tarea.estado === 'bloqueado' && tarea.bloqueado_por !== operadorId
  const esCompleta     = tarea.estado === 'completado'
  const esLibre        = tarea.estado === 'libre'

  const ruta = tarea.ruta_sugerida ?? []

  const cardMod = esCompleta      ? 'sd-item-card--completado'
    : esMia           ? 'sd-item-card--en-progreso'
    : bloqueadaXOtro  ? 'sd-item-card--bloqueado'
    : ''

  return (
    <div className={`sd-item-card ext-tarea-card ${cardMod}`}>

      {/* ── Cabecera ── */}
      <div className="ext-tarea-header">

        {/* SKU + EAN */}
        <div className="ext-tarea-info">
          <span className="ext-tarea-sku">{tarea.descripcion}</span>
          {tarea.codigo_barra && (
            <span className="ext-tarea-ean">
              <span className="ext-tarea-ean-label">EAN</span>
              {tarea.codigo_barra}
            </span>
          )}
        </div>

        {/* Cantidad */}
        <div className="ext-tarea-cant">
          <span className="ext-tarea-cant-num">{tarea.cantidad_total}</span>
          <span className="ext-tarea-cant-unit">Uds</span>
        </div>

        {/* Acciones / estado */}
        <div className="ext-tarea-actions">
          {esCompleta && (
            <span className="sd-badge sd-badge--ok"><IcoCheck /> Listo</span>
          )}
          {bloqueadaXOtro && (
            <span className="sd-badge sd-badge--proceso"><IcoLock /> Ocupado</span>
          )}
          {esMia && (
            <button
              className="sd-accion-btn sd-accion-btn--picking"
              onClick={() => navigate(`/picking-masivo/ola/${olaId}/extraccion/${tarea.id}`)}
            >
              Continuar
            </button>
          )}
          {esLibre && (
            <button
              className="sd-accion-btn sd-accion-btn--picking"
              disabled={tomandoId === tarea.id}
              onClick={() => onTomar(tarea)}
            >
              {tomandoId === tarea.id ? 'Tomando…' : 'Tomar'}
            </button>
          )}
        </div>
      </div>

      {/* ── Ruta FIFO sugerida ── */}
      {ruta.length > 0 && (esMia || esCompleta) && (
        <div className="ext-tarea-body">
          <div className="ext-ruta">
            <span className="ext-ruta-label">Ruta FIFO sugerida</span>
            <div className="ext-ruta-chips">
              {ruta.map((tramo, i) => (
                <span key={i} className={`ext-ruta-chip ${esCompleta ? 'ext-ruta-chip--done' : ''}`}>
                  <IcoPin /> {tramo.posicion_codigo}
                  <span className="ext-ruta-cant">{tramo.cantidad} u.</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* ── Cantidad extraída (completada) ── */}
      {esCompleta && tarea.cantidad_extraida != null && (
        <div className="ext-tarea-body">
          <div className="ext-extraida">
            Extraído: <strong>{tarea.cantidad_extraida}</strong> de {tarea.cantidad_total} Uds.
            {tarea.cantidad_extraida < tarea.cantidad_total && (
              <span className="ext-extraida-parcial"> · diferencia: {tarea.cantidad_total - tarea.cantidad_extraida}</span>
            )}
          </div>
          {(tarea.completado_por_nombre || tarea.completado_en) && (
            <div className="ext-audit">
              {tarea.completado_por_nombre && <span className="ext-audit-quien">{tarea.completado_por_nombre}</span>}
              {tarea.completado_en && <span className="ext-audit-cuando">{fmtDt(tarea.completado_en)}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function ExtraccionOlaPage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const olaId      = id ?? ''
  const operadorId = localStorage.getItem('user_id') ?? ''

  const { data: ola }                  = useOla(olaId)
  const { data, isLoading, isError }   = useColaExtraccion(olaId)
  const tomarTarea                     = useTomarTarea(olaId)
  const liberarPropias                 = useLiberarPropiasExtraccion()

  const [tomandoId, setTomandoId] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [filtro, setFiltro]       = useState<'pendientes' | 'mias' | 'ocupadas' | 'completas'>('pendientes')

  const tareas = data ?? []

  const cntPend  = tareas.filter(t => t.estado !== 'completado').length
  const cntMias  = tareas.filter(t => t.estado === 'bloqueado' && t.bloqueado_por === operadorId).length
  const cntOcup  = tareas.filter(t => t.estado === 'bloqueado' && t.bloqueado_por !== operadorId).length
  const cntComp  = tareas.filter(t => t.estado === 'completado').length
  const total    = tareas.length
  const pct      = total > 0 ? Math.round((cntComp / total) * 100) : 0
  const tengoPropias = cntMias > 0

  const visibles = tareas
    .filter(t => {
      if (filtro === 'pendientes') return t.estado !== 'completado'
      if (filtro === 'mias')      return t.estado === 'bloqueado' && t.bloqueado_por === operadorId
      if (filtro === 'ocupadas')  return t.estado === 'bloqueado' && t.bloqueado_por !== operadorId
      if (filtro === 'completas') return t.estado === 'completado'
      return true
    })
    .sort((a, b) => {
      // Mis tareas primero, luego libres, luego bloqueadas por otros, luego completadas
      const order = (t: TareaExtraccion) =>
        t.bloqueado_por === operadorId ? 0 : t.estado === 'libre' ? 1 : t.estado === 'bloqueado' ? 2 : 3
      return order(a) - order(b) || a.descripcion.localeCompare(b.descripcion)
    })

  async function handleTomar(tarea: TareaExtraccion) {
    setError(null)
    setTomandoId(tarea.id)
    try {
      await tomarTarea.mutateAsync({ tareaId: tarea.id, usuarioId: operadorId })
      navigate(`/picking-masivo/ola/${olaId}/extraccion/${tarea.id}`)
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'La tarea ya fue tomada por otro operador')
    } finally {
      setTomandoId(null)
    }
  }

  async function handleLiberar() {
    setError(null)
    try {
      await liberarPropias.mutateAsync({ olaId, usuarioId: operadorId })
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al liberar tareas')
    }
  }

  const proveedor = ola ? ola.proveedor.charAt(0).toUpperCase() + ola.proveedor.slice(1) : '…'

  return (
    <div className="sd-page sd-page--operador">

      {/* ── Cabecera ── */}
      <div className="sd-header">
        <button className="sd-volver-btn" onClick={() => navigate(`/picking-masivo/ola/${olaId}`)}>
          <IcoBack /> Volver
        </button>
        <div className="sd-header-title">
          <span className="sd-header-nombre">Extracción — {proveedor}</span>
          {ola?.fecha_entrega && (
            <span className="sd-header-meta">Entrega: {ola.fecha_entrega}</span>
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
      <div className="cola-progreso-wrap">
        <div className="cola-progreso-meta">
          <span className="cola-progreso-label">PROGRESO FASE 1</span>
          <span className="cola-progreso-ratio">{cntComp} / {total} SKUs · {pct}%</span>
        </div>
        <div className="cola-progreso-bg">
          <div className="cola-progreso-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {error && <div className="sd-error-banner">{error}</div>}

      {/* ── Filtros ── */}
      <div className="sd-toolbar oc-toolbar">
        <div className="sd-filtros">
          {([
            ['pendientes', `Pendientes (${cntPend})`],
            ['mias',       `Mis tareas (${cntMias})`],
            ['ocupadas',   `Ocupadas (${cntOcup})`],
            ['completas',  `Completadas (${cntComp})`],
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

      {/* ── Lista de tareas ── */}
      {isLoading && <p className="cargando">Cargando tareas…</p>}
      {isError   && <p className="error-msg">Error al cargar la cola</p>}
      {!isLoading && !isError && visibles.length === 0 && (
        <div className="sd-vacio">
          {filtro === 'completas' ? 'Aún no hay tareas completadas' : 'No hay tareas pendientes'}
        </div>
      )}
      {!isLoading && !isError && visibles.length > 0 && (
        <div className="sd-items-lista">
          {visibles.map(t => (
            <TareaCard
              key={t.id}
              tarea={t}
              operadorId={operadorId}
              olaId={olaId}
              tomandoId={tomandoId}
              onTomar={handleTomar}
            />
          ))}
        </div>
      )}
    </div>
  )
}
