import { useDashboard } from '../hooks/useDashboard'
import { SubtituloModulo } from '../../../shared/components/SubtituloModulo'

// ── Datos reales — flujo de trabajo ──────────────────────────────────────────
// Los estados de notas_venta se mapean directamente desde los KPIs del dashboard.

// ── Íconos ────────────────────────────────────────────────────────────────────

function IcoBox()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> }
function IcoClock()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function IcoTruck()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> }
function IcoFlow()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="6" height="4" rx="1"/><rect x="9" y="3" width="6" height="4" rx="1"/><rect x="16" y="3" width="6" height="4" rx="1"/><path d="M5 7v4"/><path d="M12 7v4"/><path d="M19 7v4"/><rect x="2" y="11" width="6" height="4" rx="1"/><rect x="9" y="11" width="6" height="4" rx="1"/><rect x="16" y="11" width="6" height="4" rx="1"/></svg> }

// ── Barra de progreso ─────────────────────────────────────────────────────────

function BarraFlujo({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="tc-flujo-barra-bg">
      <div className="tc-flujo-barra-fill" style={{ width: `${pct}%`, background: color }}/>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DashboardOperador() {
  const nombreUsuario                = localStorage.getItem('user_nombre') ?? ''
  const { data: kpis, isLoading }    = useDashboard()

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
        <h1 className="tc-bienvenida">
          <span className="tc-bienvenida-saludo">Bienvenido</span>
          <span className="tc-bienvenida-nombre">{nombreUsuario}</span>
        </h1>
      </div>
      <SubtituloModulo modulo="inicioOperador" espaciado />

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
      </div>
    </div>
  )
}
