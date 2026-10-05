import { useParams, useNavigate, Link } from 'react-router-dom'
import { useOla, useColaExtraccion, useLineasPreparacion, useLineasDespacho } from '../hooks/useOlas'
import { useAuth } from '../../auth/hooks/useAuth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FASE_LABEL: Record<string, string> = {
  validando:      'Validando',
  en_extraccion:  'Fase 1 — Extracción',
  en_preparacion: 'Fase 2 — Preparación',
  completada:     'Fase 3 — Despacho',
  despachada:     'Despachada',
  cancelada:      'Cancelada',
}

const FASE_CLASS: Record<string, string> = {
  validando:      'ola-badge--validando',
  en_extraccion:  'ola-badge--activa',
  en_preparacion: 'ola-badge--activa',
  completada:     'ola-badge--completada',
  despachada:     'ola-badge--despachada',
  cancelada:      'ola-badge--cancelada',
}

function fmt(val: string | null | undefined, fb = '—') {
  return val ?? fb
}

// ─── Iconos ───────────────────────────────────────────────────────────────────

function IcoBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  )
}
function IcoUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function IcoChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}

function IcoExcel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
    </svg>
  )
}

function IcoBox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={22} height={22}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  )
}

function IcoTag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={22} height={22}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  )
}

function IcoCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={22} height={22}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

function IcoList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={22} height={22}>
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  )
}

// ─── Paso visual ─────────────────────────────────────────────────────────────

type PasoProps = {
  numero: number
  titulo: string
  desc:   string
  activo: boolean
  hecho:  boolean
  verDetalle?: boolean
  onIr?:  () => void
  btnLabel?: string
}

function PasoCard({ numero, titulo, desc, activo, hecho, verDetalle, onIr, btnLabel }: PasoProps) {
  const mostrarBtn = onIr && (activo || (hecho && verDetalle))
  return (
    <div className={`ola-paso ${activo ? 'ola-paso--activo' : ''} ${hecho ? 'ola-paso--hecho' : ''}`}>
      <div className="ola-paso-num">
        {hecho
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>
          : numero
        }
      </div>
      <div className="ola-paso-body">
        <p className="ola-paso-titulo">{titulo}</p>
        <p className="ola-paso-desc">{desc}</p>
      </div>
      {mostrarBtn && (
        <button className="btn-primario ola-paso-btn" onClick={onIr}>
          {activo && verDetalle ? 'Ver monitoreo' : (hecho && verDetalle) ? 'Ver detalle' : (btnLabel ?? 'Ir')}
        </button>
      )}
      {hecho && !mostrarBtn && <span className="ola-paso-done">Completado</span>}
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function OlaDetallePage() {
  const { id }      = useParams<{ id: string }>()
  const navigate    = useNavigate()
  const { sesion }  = useAuth()
  const { data: ola, isLoading, error } = useOla(id ?? null)
  const esAdmin = sesion.rol === 'admin'
  const enFase  = ola?.estado === 'en_extraccion' || ola?.estado === 'en_preparacion'

  const { data: tareas }   = useColaExtraccion(esAdmin && enFase ? (id ?? null) : null)
  const { data: lineasF2 } = useLineasPreparacion(esAdmin && ola?.estado === 'en_preparacion' ? (id ?? null) : null)
  const { data: lineasF3 } = useLineasDespacho(esAdmin && (ola?.estado === 'completada' || ola?.estado === 'despachada') ? (id ?? null) : null)

  if (isLoading) {
    return (
      <div className="notas-page">
        <div className="ola-skeleton-header" />
        <div className="ola-kpi-grid">
          {[0,1,2,3].map(i => <div key={i} className="ola-kpi-card ola-kpi-card--skeleton" />)}
        </div>
      </div>
    )
  }

  if (error || !ola) {
    return <div className="notas-page"><p className="error-banner">Ola no encontrada</p></div>
  }

  const esOperador = sesion.rol === 'operador'
  const proveedor  = ola.proveedor.charAt(0).toUpperCase() + ola.proveedor.slice(1)
  const titulo     = `Entrega ${proveedor}`

  const faseIdx: Record<string, number> = {
    validando: 0, en_extraccion: 1, en_preparacion: 2, completada: 3, despachada: 3,
  }
  const fase = faseIdx[ola.estado] ?? 0

  return (
    <div className="notas-page ola-page">

      {/* ── Header ── */}
      <div className="ola-header">
        <div className="ola-header-left">
          <button className="btn-volver" onClick={() => navigate(esOperador ? '/picking-masivo/operador' : '/picking-masivo')}>
            <IcoBack /> Volver
          </button>
          <h1 className="ola-titulo">{titulo}</h1>
          <span className={`ola-badge ${FASE_CLASS[ola.estado] ?? ''}`}>
            {FASE_LABEL[ola.estado] ?? ola.estado}
          </span>
        </div>
      </div>

      {/* ── KPI grid ── */}
      <div className="ola-kpi-grid">
        <div className="ola-kpi-card ola-kpi-card--entrega">
          <div className="ola-kpi-icon"><IcoCalendar /></div>
          <span className="ola-kpi-label">Entrega</span>
          <span className="ola-kpi-valor">{fmt(ola.fecha_entrega)}</span>
        </div>
        <div className="ola-kpi-card">
          <div className="ola-kpi-icon"><IcoList /></div>
          <span className="ola-kpi-label">Órdenes</span>
          <span className="ola-kpi-valor">{ola.total_ordenes}</span>
        </div>
        <div className="ola-kpi-card">
          <div className="ola-kpi-icon"><IcoTag /></div>
          <span className="ola-kpi-label">LPNs</span>
          <span className="ola-kpi-valor">{ola.total_lineas}</span>
        </div>
        {!esOperador && sesion.rol !== 'supervisor' && (
          <div className="ola-kpi-card ola-kpi-card--archivo">
            <div className="ola-kpi-icon"><IcoExcel /></div>
            <span className="ola-kpi-label">Archivo</span>
            <span className="ola-kpi-archivo-nombre">{fmt(ola.archivo_nombre)}</span>
          </div>
        )}
      </div>

      {/* ── Monitoreo (solo admin, ola en proceso) ── */}
      {esAdmin && (ola.estado === 'en_extraccion' || ola.estado === 'en_preparacion') && (() => {
        const esFase2 = ola.estado === 'en_preparacion'

        // Fase 1 — operadores con tarea bloqueada
        const listaF1 = (tareas ?? []) as import('../services/olas.api').TareaExtraccion[]
        const enProceso = listaF1.filter(t => t.estado === 'bloqueado')
        const opIdsF1 = [...new Set(enProceso.map(t => t.bloqueado_por).filter(Boolean) as string[])]
        const cntCompF1 = listaF1.filter(t => t.estado === 'completado').length
        const pctF1 = listaF1.length > 0 ? Math.round((cntCompF1 / listaF1.length) * 100) : 0

        // Fase 2 — operadores que escanearon al menos un LPN
        const listaF2 = lineasF2 ?? []
        const nombresF2 = [...new Set(
          listaF2
            .filter(l => l.fase2_escaneado && l.fase2_por_nombre)
            .map(l => l.fase2_por_nombre as string)
        )]
        const cntCompF2 = listaF2.filter(l => l.fase2_escaneado).length
        const pctF2 = listaF2.length > 0 ? Math.round((cntCompF2 / listaF2.length) * 100) : 0

        const opNames = esFase2 ? nombresF2 : opIdsF1.map(id => {
          const t = enProceso.find(t => t.bloqueado_por === id)
          return (t as any)?.bloqueado_por_nombre ?? id.slice(0, 8)
        })

        return (
          <div className="ola-monitor-banner">
            <div className="ola-monitor-col ola-monitor-col--ops">
              <span className="ola-monitor-titulo">👥 OPERADORES EN ZONA ({opNames.length})</span>
              {opNames.length === 0 ? (
                <span className="ola-monitor-vacio">Sin operadores activos</span>
              ) : (
                <div className="ola-monitor-ops">
                  {opNames.map((nombre, i) => {
                    const tarea = !esFase2 ? enProceso.find(t => (t as any).bloqueado_por_nombre === nombre || t.bloqueado_por === opIdsF1[i]) : null
                    return (
                      <div key={nombre} className="ola-monitor-op-row">
                        <span className="ola-monitor-avatar"><IcoUser /></span>
                        <div className="ola-monitor-op-info">
                          <span className="ola-monitor-op-nombre">{nombre}</span>
                          {tarea && <span className="ola-monitor-op-sku">Extrayendo: {tarea.descripcion}</span>}
                          {esFase2 && <span className="ola-monitor-op-sku">Asignando LPNs</span>}
                        </div>
                        <span className="ola-monitor-op-dot" />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="ola-monitor-col ola-monitor-col--prog">
              <span className="ola-monitor-titulo">{esFase2 ? 'AVANCE FASE 2' : 'AVANCE FASE 1'}</span>
              <div className="ola-monitor-barra-bg">
                <div className="ola-monitor-barra-fill" style={{ width: `${esFase2 ? pctF2 : pctF1}%` }} />
              </div>
              <span className="ola-monitor-uds">
                {esFase2
                  ? <><strong>{cntCompF2}</strong> / {listaF2.length} LPNs · {pctF2}%</>
                  : <><strong>{cntCompF1}</strong> / {listaF1.length} SKUs · {pctF1}%</>
                }
              </span>
            </div>
          </div>
        )
      })()}

      {/* ── Monitoreo Fase 3 (solo admin, completada o despachada) ── */}
      {esAdmin && (ola.estado === 'completada' || ola.estado === 'despachada') && (() => {
        const lista = (lineasF3 ?? []) as any[]
        const validadas = lista.filter(l => l.fase3_validado)
        const pendientes = lista.filter(l => !l.fase3_validado)
        const pct = lista.length > 0 ? Math.round((validadas.length / lista.length) * 100) : 0

        // Supervisores únicos que validaron algo
        const supervisores = [...new Map(
          validadas
            .filter(l => l.fase3_por_nombre)
            .map(l => [l.fase3_por_nombre, l])
        ).values()]

        const isDespachada = ola.estado === 'despachada'

        return (
          <div className="ola-monitor-banner ola-monitor-banner--f3">
            <div className="ola-monitor-col ola-monitor-col--ops">
              <span className="ola-monitor-titulo">
                {isDespachada ? '✅ VALIDADO POR' : '👁 SUPERVISANDO DESPACHO'}
              </span>
              {supervisores.length === 0 ? (
                <span className="ola-monitor-vacio">
                  {isDespachada ? 'Sin registro de supervisor' : 'Sin supervisor activo aún'}
                </span>
              ) : (
                <div className="ola-monitor-ops">
                  {supervisores.map((l: any) => {
                    // Para despachada: mostrar auditoría — quién, qué LPN, cuándo
                    // Para completada: mostrar quién está trabajando y último LPN
                    const ultimoLpn = validadas
                      .filter(v => v.fase3_por_nombre === l.fase3_por_nombre)
                      .sort((a: any, b: any) => (b.fase3_en ?? '').localeCompare(a.fase3_en ?? ''))
                    const ultimo = ultimoLpn[0]
                    const hora = ultimo?.fase3_en
                      ? new Date(ultimo.fase3_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
                      : null
                    const fecha = ultimo?.fase3_en
                      ? new Date(ultimo.fase3_en).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
                      : null
                    return (
                      <div key={l.fase3_por_nombre} className="ola-monitor-op-row">
                        <span className="ola-monitor-avatar"><IcoUser /></span>
                        <div className="ola-monitor-op-info">
                          <span className="ola-monitor-op-nombre">{l.fase3_por_nombre}</span>
                          {ultimo && (
                            <span className="ola-monitor-op-sku">
                              LPN {ultimo.lpn}
                              {fecha && hora && <> · {fecha} {hora}</>}
                            </span>
                          )}
                        </div>
                        <span className="ola-monitor-op-dot" style={{ background: isDespachada ? '#22c55e' : '#f59e0b' }} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="ola-monitor-col ola-monitor-col--prog">
              <span className="ola-monitor-titulo">AVANCE FASE 3</span>
              <div className="ola-monitor-barra-bg">
                <div className="ola-monitor-barra-fill" style={{ width: `${pct}%`, background: isDespachada ? '#22c55e' : undefined }} />
              </div>
              <span className="ola-monitor-uds">
                <strong>{validadas.length}</strong> / {lista.length} LPNs validados · {pct}%
              </span>
              {pendientes.length > 0 && !isDespachada && (
                <span style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                  {pendientes.length} LPN{pendientes.length > 1 ? 's' : ''} pendiente{pendientes.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Fecha y hora de despacho ── */}
      {esAdmin && ola.estado === 'despachada' && ola.despachada_en && (() => {
        const d = new Date(ola.despachada_en)
        const fecha = d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
        const hora  = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
        return (
          <div className="ola-despacho-fecha-card">
            <span className="ola-despacho-fecha-label">FECHA Y HORA DE DESPACHO</span>
            <span className="ola-despacho-fecha-val">{fecha} — {hora}</span>
            {ola.nombre_chofer && (
              <span className="ola-despacho-fecha-chofer">Chofer: {ola.nombre_chofer}</span>
            )}
          </div>
        )
      })()}

      {/* ── Pasos del picking ── */}
      {ola.estado !== 'cancelada' && (
        <section className="ola-pasos-seccion">
          <h2 className="ola-pasos-titulo">Pasos del picking</h2>
          <div className="ola-pasos-lista">
            <PasoCard
              numero={1} titulo="Picking Consolidado"
              desc="El Personal extrae el total de unidades por SKU."
              activo={ola.estado === 'en_extraccion'}
              hecho={fase > 1}
              verDetalle={!esOperador}
              onIr={() => navigate(`/picking-masivo/ola/${id}/extraccion`)}
              btnLabel="Picking"
            />
            <PasoCard
              numero={2} titulo="Preparación y asignación LPN"
              desc="El personal escanea cada LPN para asignar los SKU a cada tienda destino."
              activo={ola.estado === 'en_preparacion'}
              hecho={fase > 2}
              verDetalle={!esOperador}
              onIr={() => navigate(`/picking-masivo/ola/${id}/preparacion`)}
              btnLabel="Asignar LPN"
            />
            {sesion.rol === 'supervisor' && (
              <PasoCard
                numero={3} titulo="Validación y despacho"
                desc="El supervisor valida los LPNs escaneados y autoriza el despacho al transportista."
                activo={ola.estado === 'completada'}
                hecho={ola.estado === 'despachada'}
                onIr={() => navigate(`/picking-masivo/ola/${id}/despacho`)}
                btnLabel="Validar Carga"
              />
            )}
          </div>
        </section>
      )}

      {/* ── Pie de página (creado por / despachado por) ── */}
      <div className="ola-footer-meta">
        {ola.creado_por_usuario && (
          <span>Creado por <strong>{ola.creado_por_usuario.nombre}</strong></span>
        )}
        {ola.despachada_en && ola.nombre_chofer && (
          <span>Despachado · Chofer: <strong>{ola.nombre_chofer}</strong></span>
        )}
      </div>
    </div>
  )
}
