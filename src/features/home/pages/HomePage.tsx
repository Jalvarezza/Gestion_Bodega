import React from 'react'
import { useNavigate } from 'react-router-dom'
import type { UserRole } from '../../../shared/types/base'
import { useDashboard } from '../hooks/useDashboard'
import { GraficoDespachosMensuales } from '../components/GraficoDespachosMensuales'
import { DashboardBI } from '../components/DashboardBI'
import { DashboardOperador } from '../components/DashboardOperador'

// ── Íconos nav ────────────────────────────────────────────────────────────

const ICONOS: Record<string, React.ReactElement> = {
  productos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  ubicaciones: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  ingresos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="12" y1="8" x2="12" y2="13" /><line x1="9.5" y1="11" x2="12" y2="13.5" /><line x1="14.5" y1="11" x2="12" y2="13.5" />
    </svg>
  ),
  notas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  salidas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 5v3h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  traslados: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M15 6l6 6-6 6" /><path d="M19 12H5" /><path d="M9 6L3 12l6 6" />
    </svg>
  ),
  historial: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  picking: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/>
      <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  ),
}

type NavItem = { ruta: string; rutaOperador?: string; key: string; label: string; desc: string; roles?: UserRole[] }

const NAV_ITEMS: NavItem[] = [
  { ruta: '/productos',               key: 'productos',   label: 'Busqueda',       desc: 'Buscar stock por SKU' },
  { ruta: '/ubicaciones',             key: 'ubicaciones', label: 'Mapa Bodega',    desc: 'Ver estructura de bodega' },
  { ruta: '/ingresos',                key: 'ingresos',    label: 'Importacion',    desc: 'Recibir órdenes de compra',      roles: ['admin'] },
  { ruta: '/notas',                   key: 'notas',       label: 'NV preparacion', desc: 'Picking y despacho' },
  { ruta: '/salidas',                 key: 'salidas',     label: 'NV despacho',    desc: 'Revisión antes de despacho',     roles: ['admin', 'supervisor'] },
  { ruta: '/traslados',               key: 'traslados',   label: 'Traslado',       desc: 'Re-ubicar e intercambiar' },
  { ruta: '/historial',               key: 'historial',   label: 'Historial',      desc: 'Auditoría de movimientos',       roles: ['admin', 'supervisor'] },
  { ruta: '/picking-masivo', rutaOperador: '/picking-masivo/operador', key: 'picking', label: 'Picking Masivo', desc: 'OC masivas' },
]

// ── KPI card ──────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color, icon,
}: {
  label: string
  value: string | number
  sub?:  string
  color: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'slate'
  icon:  React.ReactElement
}) {
  const colors: Record<string, string> = {
    blue:   'kpi-blue',
    green:  'kpi-green',
    amber:  'kpi-amber',
    red:    'kpi-red',
    purple: 'kpi-purple',
    slate:  'kpi-slate',
  }
  return (
    <div className={`kpi-card ${colors[color]}`}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-body">
        <p className="kpi-label">{label}</p>
        <p className="kpi-value">{value}</p>
        {sub && <p className="kpi-sub">{sub}</p>}
      </div>
    </div>
  )
}

// ── Íconos KPI ────────────────────────────────────────────────────────────

function IcoBox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  )
}
function IcoStack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
    </svg>
  )
}
function IcoClipboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>
  )
}
function IcoTruck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/>
      <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  )
}
function IcoImport() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
    </svg>
  )
}
function IcoRack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="1"/><rect x="2" y="10" width="20" height="5" rx="1"/><rect x="2" y="17" width="20" height="5" rx="1"/>
    </svg>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────

// ── Dashboard por rol ─────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate()
  const rol    = localStorage.getItem('user_rol') as UserRole | null
  const nombre = localStorage.getItem('user_nombre') ?? ''

  // Admin + Supervisor: dashboard BI ejecutivo completo
  if (rol === 'admin' || rol === 'supervisor') {
    return <DashboardBI />
  }

  const items = NAV_ITEMS.filter((item) =>
    !item.roles || (rol !== null && item.roles.includes(rol))
  )

  const { data: kpis, isLoading: kpisLoading } = useDashboard()

  // Operador: Torre de Control — Dashboard de producción
  if (rol === 'operador') {
    return <DashboardOperador />
  }

  // Fallback (rol desconocido): vista simple con todos los ítems
  return (
    <div className="home-page">
      <h1 className="home-titulo">
        Hola{nombre && <span className="home-titulo-nombre">, {nombre}</span>} 👋
      </h1>

      {/* ── KPIs ── */}
      <div className="kpi-grid">
        <KpiCard
          label="NV en preparación"
          value={kpisLoading ? '—' : kpis?.notasPendientes ?? 0}
          color={kpis?.notasPendientes ? 'amber' : 'slate'}
          icon={<IcoBox />}
        />
        <KpiCard
          label="Imp. en transito"
          value={kpisLoading ? '—' : kpis?.ocPendientes ?? 0}
          color={kpis?.ocPendientes ? 'red' : 'slate'}
          icon={<IcoImport />}
        />
        <KpiCard
          label="NV por revisar"
          value={kpisLoading ? '—' : kpis?.notasDespacho ?? 0}
          color={kpis?.notasDespacho ? 'amber' : 'slate'}
          icon={<IcoTruck />}
        />
      </div>

      {/* ── Gráfico de despachos mensuales ── */}
      <GraficoDespachosMensuales />

      {/* ── Nav ── */}
      <p className="home-seccion-label">Módulos</p>
      <div className="home-grid">
        {items.map((item) => (
          <button
            key={item.ruta}
            className="home-card"
            onClick={() => navigate(rol === 'operador' && item.rutaOperador ? item.rutaOperador : item.ruta)}
          >
            <span className="home-icono">{ICONOS[item.key]}</span>
            <span className="home-label">{item.label}</span>
            <span className="home-desc">{item.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
