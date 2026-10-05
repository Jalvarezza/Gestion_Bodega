import { useState, useEffect } from 'react'
import { useDashboard, useEquipoBodega } from '../hooks/useDashboard'

// ── Datos reales — flujo de trabajo ──────────────────────────────────────────
// Los estados de notas_venta se mapean directamente desde los KPIs del dashboard.

// ── Íconos ────────────────────────────────────────────────────────────────────

function IcoBox()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> }
function IcoClock()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function IcoTruck()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> }
function IcoFlow()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="6" height="4" rx="1"/><rect x="9" y="3" width="6" height="4" rx="1"/><rect x="16" y="3" width="6" height="4" rx="1"/><path d="M5 7v4"/><path d="M12 7v4"/><path d="M19 7v4"/><rect x="2" y="11" width="6" height="4" rx="1"/><rect x="9" y="11" width="6" height="4" rx="1"/><rect x="16" y="11" width="6" height="4" rx="1"/></svg> }
function IcoFactory(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M2 20v-8l4-4 4 8 4-8 4 4v8H2z"/><line x1="2" y1="20" x2="22" y2="20"/></svg> }
function IcoUsers()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }

// ── Barra de progreso ─────────────────────────────────────────────────────────

function BarraFlujo({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="tc-flujo-barra-bg">
      <div className="tc-flujo-barra-fill" style={{ width: `${pct}%`, background: color }}/>
    </div>
  )
}

function BarraAvance({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="tc-avance-bg">
      <div className="tc-avance-fill" style={{ width: `${pct}%`, background: color }}/>
    </div>
  )
}

// ── Config de estado de operador ──────────────────────────────────────────────

const ESTADO_OP_CFG = {
  en_nota:  { label: 'Picking Activo', color: '#34d399', dot: '#34d399' },
  activo:   { label: 'Activo hoy',     color: '#38bdf8', dot: '#38bdf8' },
  inactivo: { label: 'Sin actividad',  color: '#94a3b8', dot: '#94a3b8' },
} as const

// ── Reloj en tiempo real ──────────────────────────────────────────────────────

function RelojTurno() {
  const [hora, setHora] = useState(() =>
    new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  )
  useEffect(() => {
    const id = setInterval(() => {
      setHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="tc-reloj">{hora}</span>
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DashboardOperador() {
  const { data: kpis, isLoading }    = useDashboard()
  const { data: equipo, isLoading: equipoLoading } = useEquipoBodega()

  const operadores = equipo?.operadores ?? []

  // Flujo de trabajo desde datos reales
  const pendientes   = kpis?.notasPendientes ?? 0
  const enPicking    = 0  // "preparacion" activa — no tenemos ese campo separado en el dashboard
  const listasAudit  = kpis?.notasDespacho ?? 0   // completas listas para despacho
  const despachadas  = 0  // no expuesto en el KPI general aún

  // Total aproximado para calcular porcentajes
  const totalFlujo = pendientes + enPicking + listasAudit + despachadas

  const flujoItems = [
    { label: 'Pendientes de Picking',   cant: pendientes,  color: '#94a3b8' },
    { label: 'Listas para Despacho',    cant: listasAudit, color: '#fbbf24' },
  ]

  return (
    <div className="tc-wrap">

      {/* ── Cabecera ────────────────────────────────────────────────────────── */}
      <div className="tc-header">
        <div className="tc-header-left">
          <div className="tc-header-title-row">
            <span className="tc-header-ico"><IcoFactory /></span>
            <h1 className="tc-titulo">Torre de Control — Producción Bodega</h1>
          </div>
        </div>
        <RelojTurno />
      </div>

      {/* ── KPIs producción ─────────────────────────────────────────────────── */}
      <div className="tc-kpi-inline">
        <div className="tc-kpi-inline-item">
          <IcoClock />
          <span className="tc-kpi-inline-label">NV Pendiente:</span>
          <span className="tc-kpi-inline-val tc-kpi-inline-val--pending">
            {isLoading ? '—' : pendientes}
          </span>
        </div>
        <div className="tc-kpi-inline-sep" />
        <div className="tc-kpi-inline-item">
          <IcoTruck />
          <span className="tc-kpi-inline-label">NV Completas:</span>
          <span className="tc-kpi-inline-val tc-kpi-inline-val--done">
            {isLoading ? '—' : listasAudit}
          </span>
        </div>
      </div>

      {/* ── Cuerpo ──────────────────────────────────────────────────────────── */}
      <div className="tc-body">

        {/* ── Columna izquierda ──────────────────────────────────────────── */}
        <div className="tc-col-left">

          {/* Flujo de trabajo */}
          <div className="tc-panel">
            <div className="tc-panel-header">
              <div>
                <h2 className="tc-panel-titulo"><IcoFlow /> Estado del Flujo de Trabajo</h2>
                <p className="tc-panel-sub">
                  {isLoading
                    ? 'Cargando…'
                    : `Distribución en tiempo real — ${totalFlujo} NVs totales`
                  }
                </p>
              </div>
            </div>
            <div className="tc-flujo-list">
              {flujoItems.map(f => {
                const pct = totalFlujo > 0 ? Math.round((f.cant / totalFlujo) * 100) : 0
                return (
                  <div key={f.label} className="tc-flujo-fila">
                    <div className="tc-flujo-label-row">
                      <span className="tc-flujo-dot" style={{ background: f.color }}/>
                      <span className="tc-flujo-label">{f.label}</span>
                      <span className="tc-flujo-cant" style={{ color: f.color }}>
                        {isLoading ? '—' : f.cant} NVs
                      </span>
                      <span className="tc-flujo-pct">{isLoading ? '' : `${pct}%`}</span>
                    </div>
                    <BarraFlujo pct={pct} color={f.color} />
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        {/* ── Columna derecha ─────────────────────────────────────────────── */}
        <div className="tc-col-right">

          {/* Productividad del equipo — datos reales */}
          <div className="tc-panel tc-panel-full">
            <div className="tc-panel-header">
              <div>
                <h2 className="tc-panel-titulo"><IcoUsers /> Productividad del Equipo</h2>
                <p className="tc-panel-sub">
                  {equipoLoading
                    ? 'Cargando…'
                    : operadores.length > 0
                      ? `${operadores.filter(o => o.estado !== 'inactivo').length} operadores activos hoy`
                      : 'Sin actividad de picking hoy'
                  }
                </p>
              </div>
            </div>

            {equipoLoading && (
              <p className="cargando" style={{ fontSize: 13, padding: '12px 0' }}>Cargando equipo…</p>
            )}

            {!equipoLoading && operadores.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
                Ningún operador ha registrado picking hoy.
              </p>
            )}

            {!equipoLoading && operadores.length > 0 && (
              <div className="tc-equipo-list">
                {operadores.map((op, i) => {
                  const cfg = ESTADO_OP_CFG[op.estado]
                  return (
                    <div key={op.usuarioId} className="tc-equipo-fila">
                      <span className="tc-equipo-rank">{i + 1}</span>
                      <div className="tc-equipo-info">
                        <span className="tc-equipo-nombre">{op.nombre}</span>
                        <BarraAvance pct={op.avancePct} color={cfg.dot} />
                      </div>
                      <span className="tc-equipo-ritmo">
                        {op.ritmoLph} <span className="tc-equipo-unit">L/h</span>
                      </span>
                      <span className="tc-equipo-avance-pct" style={{ color: cfg.dot }}>
                        {op.pickingsHoy} <span className="tc-equipo-unit" style={{ fontSize: 10 }}>picks</span>
                      </span>
                      <span
                        className="tc-estado-badge"
                        style={{ color: cfg.color, borderColor: `${cfg.color}40`, background: `${cfg.color}12` }}
                      >
                        <span className="tc-estado-dot" style={{ background: cfg.dot }}/>
                        {cfg.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
