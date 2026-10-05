import { useState, Component } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboard, useDespachosSemana, useDespachosDia, useKpisBi } from '../hooks/useDashboard'
import type { DiaDespacho } from '../hooks/useDashboard'

// ── Error boundary ────────────────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: 'var(--text-primary)' }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Error en Dashboard</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{this.state.error}</p>
          <button style={{ marginTop: 16, padding: '6px 12px', cursor: 'pointer' }} onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Íconos ────────────────────────────────────────────────────────────────

function IcoBox()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> }
function IcoImport()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg> }
function IcoTruck()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> }
function IcoChart()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function IcoActivity(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }

// ── KPI operacional ───────────────────────────────────────────────────────

function KpiOp({ icon, label, valor, sub, alerta, onClick }: {
  icon: ReactNode; label: string; valor: number | string
  sub?: string; alerta?: boolean; onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={`bi-kpi-op ${alerta ? 'bi-kpi-op--alerta' : valor === 0 || valor === '0' ? 'bi-kpi-op--inactivo' : 'bi-kpi-op--activo'}`}
      onClick={onClick}
    >
      <div className="bi-kpi-op-icon">{icon}</div>
      <div className="bi-kpi-op-body">
        <p className="bi-kpi-op-label">{label}</p>
        <p className="bi-kpi-op-valor">{valor}</p>
        {sub && <p className="bi-kpi-op-sub">{sub}</p>}
      </div>
      {alerta && <span className="bi-kpi-op-badge">!</span>}
    </button>
  )
}

// ── Gráfico barras (HTML/CSS) ─────────────────────────────────────────────

const CHART_H = 90  // px área de barras

function GraficoDiario({ data, diaActivo, onClickDia }: {
  data: DiaDespacho[]; diaActivo: string | null; onClickDia: (dia: string) => void
}) {
  const rows = Array.isArray(data) ? data : []
  if (rows.length === 0) {
    return <div className="bi-chart-empty">Cargando…</div>
  }

  const maxV = Math.max(1, ...rows.map(d => d.cant))

  return (
    <div className="bi-chart-outer">
      <div className="bi-chart-area">
        {rows.map(d => {
          const px      = d.cant > 0 ? Math.max(6, Math.round((d.cant / maxV) * CHART_H)) : 3
          const activo  = diaActivo === d.dia
          const clicable = d.cant > 0
          return (
            <div key={d.dia} className="bi-chart-col">
              <div className="bi-chart-bar-track">
                <span className="bi-chart-val">{d.cant > 0 ? d.cant : ''}</span>
                <button
                  type="button"
                  className={`bi-chart-bar ${activo ? 'bi-chart-bar--activo' : ''} ${clicable ? 'bi-chart-bar--clicable' : 'bi-chart-bar--vacio'}`}
                  style={{ height: px }}
                  onClick={() => { if (clicable) onClickDia(d.dia) }}
                  title={clicable ? `${d.label}: ${d.cant} despachos` : undefined}
                />
              </div>
              <span className={`bi-chart-label ${activo ? 'bi-chart-label--activo' : ''}`}>{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────

function DashboardBIInner() {
  const navigate = useNavigate()
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)

  const { data: kpis, isLoading: kpisLoading } = useDashboard()
  const { data: semanaData } = useDespachosSemana()
  const { data: notasDia, isLoading: cargandoDia } = useDespachosDia(diaSeleccionado)
  const { data: biData } = useKpisBi()

  const mesActual = new Date().toLocaleString('es-CL', { month: 'long', year: 'numeric' })

  function fmtHora(hora: string) {
    // "09:30 a. m." → "09:30" para que quepa en el panel estrecho
    return hora.replace(/\s*(a\.|p\.)\s*m\./i, '').trim()
  }

  function toggleDia(dia: string) {
    setDiaSeleccionado(prev => prev === dia ? null : dia)
  }

  function labelFecha(dia: string) {
    try {
      const d = new Date(`${dia}T12:00:00`)
      return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    } catch {
      return dia
    }
  }

  function horaDespacho(fechaStr: string) {
    try {
      return new Date(fechaStr).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return '—'
    }
  }

  return (
    <div className="bi-wrap">

      {/* Cabecera */}
      <div className="bi-header">
        <div className="bi-header-left">
          <h1 className="bi-titulo">
            <span className="bi-titulo-ico"><IcoChart /></span>
            Dashboard de Gestión Logística
          </h1>
          <p className="bi-subtitulo">Bodega Central Grantt — {mesActual}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="bi-kpi-op-row">
        <KpiOp
          icon={<IcoBox />}
          label="NV en preparación"
          valor={kpisLoading ? '—' : kpis?.notasPendientes ?? 0}
          sub={!kpisLoading && !kpis?.notasPendientes ? 'Sin trabajo activo' : undefined}
          onClick={() => navigate('/notas')}
        />
        <KpiOp
          icon={<IcoImport />}
          label="Imp. en tránsito"
          valor={kpisLoading ? '—' : kpis?.ocPendientes ?? 0}
          sub={!kpisLoading && !kpis?.ocPendientes ? 'Sin importaciones' : undefined}
          onClick={() => navigate('/ingresos')}
        />
        <KpiOp
          icon={<IcoTruck />}
          label="NV por revisar"
          valor={kpisLoading ? '—' : kpis?.notasDespacho ?? 0}
          sub={!kpisLoading && (kpis?.notasDespacho ?? 0) > 0 ? '¡Requiere atención!' : 'Sin pendientes'}
          alerta={!kpisLoading && (kpis?.notasDespacho ?? 0) > 0}
          onClick={() => navigate('/salidas')}
        />
      </div>

      {/* Cuerpo */}
      <div className="bi-body">

        {/* Columna izquierda */}
        <div className="bi-col-left">
          <div className="bi-panel">
            <div className="bi-panel-header">
              <div>
                <h2 className="bi-panel-titulo"><IcoTruck /> Despachos de la Semana</h2>
                <p className="bi-panel-sub">Click en una barra para ver el detalle del día</p>
              </div>
              {diaSeleccionado && (
                <button type="button" className="bi-dia-cerrar" onClick={() => setDiaSeleccionado(null)}>✕</button>
              )}
            </div>

            <GraficoDiario
              data={Array.isArray(semanaData?.dias) ? semanaData!.dias : []}
              diaActivo={diaSeleccionado}
              onClickDia={toggleDia}
            />

            {diaSeleccionado && (
              <div className="bi-dia-detalle">
                <p className="bi-dia-detalle-titulo">
                  {labelFecha(diaSeleccionado)}
                  <span className="bi-dia-detalle-count">
                    {cargandoDia ? '…' : `${Array.isArray(notasDia) ? notasDia.length : 0} despachos`}
                  </span>
                </p>
                {cargandoDia && <p className="bi-dia-detalle-loading">Cargando…</p>}
                {!cargandoDia && (Array.isArray(notasDia) ? notasDia.length : 0) === 0 && (
                  <p className="bi-dia-detalle-vacio">Sin despachos ese día</p>
                )}
                {!cargandoDia && (Array.isArray(notasDia) ? notasDia : []).map(n => {
                  const ruta =
                    n.tipo === 'nv'     ? `/notas/${n.id}` :
                    n.tipo === 'sesion' ? `/picking-masivo/${n.id}` :
                                         `/picking-masivo/ola/${n.id}`
                  const tipoBadge  = n.tipo === 'nv' ? 'NV' : n.tipo === 'sesion' ? 'PM' : 'OLA'
                  const badgeColor = n.tipo === 'nv' ? '#34d399' : n.tipo === 'sesion' ? '#f59e0b' : '#a78bfa'
                  return (
                    <button type="button" key={`${n.tipo}-${n.id}`} className="bi-dia-nota-row" onClick={() => navigate(ruta)}>
                      <span className="bi-dia-nota-tipo" style={{ color: badgeColor }}>{tipoBadge}</span>
                      <span className="bi-dia-nota-num">{n.referencia}</span>
                      <span className="bi-dia-nota-cliente">{n.nombreCliente}</span>
                      <span className="bi-dia-nota-hora">{horaDespacho(n.fechaDespacho)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha */}
        <div className="bi-col-right">
          <div className="bi-panel">
            <div className="bi-panel-header">
              <div>
                <h2 className="bi-panel-titulo"><IcoActivity /> Actividad Reciente</h2>
                <p className="bi-panel-sub">Auditoría del turno en curso</p>
              </div>
            </div>
            <div className="bi-actividad-list">
              {(biData?.actividadReciente ?? []).length === 0
                ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin actividad reciente</p>
                : (biData?.actividadReciente ?? []).map((ev, i) => (
                    <div key={i} className={`bi-actividad-item bi-actividad-item--${ev.tipo}`}>
                      <span className="bi-actividad-hora">{fmtHora(ev.hora)}</span>
                      <span className="bi-actividad-texto">{ev.texto}</span>
                    </div>
                  ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DashboardBI() {
  return (
    <ErrorBoundary>
      <DashboardBIInner />
    </ErrorBoundary>
  )
}
