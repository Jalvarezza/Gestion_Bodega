import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOla, useLineasDespacho, useEscanearLpnF3, useDespacharOla } from '../hooks/useOlas'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import { BarcodeScanner } from '../../../shared/components/BarcodeScanner'

// ── Íconos ────────────────────────────────────────────────────────────────────

function IcoBack() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
}
function IcoCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>
}
function IcoWarn() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
}
function IcoScan() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="7" y2="12.01"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="17" y1="12" x2="17" y2="12.01"/></svg>
}
function IcoStore() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function IcoTruck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

type LineaDespacho = {
  id:                 string
  lpn:                string
  tienda:             string | null
  descripcion:        string
  cantidad_solicitada: number
  fase2_escaneado:    boolean
  fase3_validado:     boolean
  fase3_en:           string | null
  ola_ordenes:        { numero_orden: string } | null
}

// ── Tarjeta LPN ───────────────────────────────────────────────────────────────

function LpnCard({ lpn, lineas }: { lpn: string; lineas: LineaDespacho[] }) {
  const validado = lineas.every(l => l.fase3_validado)
  const tienda   = lineas[0]?.tienda ?? '—'
  const orden    = lineas[0]?.ola_ordenes?.numero_orden ?? null
  const totalUds = lineas.reduce((s, l) => s + l.cantidad_solicitada, 0)

  return (
    <div className={`prep-lpn-card ${validado ? 'prep-lpn-card--done' : ''}`}>
      <div className="prep-lpn-header">
        <div className="prep-lpn-id-wrap">
          <span className="prep-lpn-id">{lpn}</span>
          {orden && <span className="prep-lpn-orden">OC: {orden}</span>}
        </div>
        <div className="prep-lpn-meta">
          {validado
            ? <span className="prep-lpn-badge prep-lpn-badge--ok"><IcoCheck /> Validado</span>
            : <span className="prep-lpn-badge prep-lpn-badge--pend">{totalUds} Uds</span>
          }
        </div>
      </div>
      <div className="prep-lpn-tienda"><IcoStore /> {tienda}</div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export function DespachoOlaPage() {
  const { id }      = useParams<{ id: string }>()
  const navigate    = useNavigate()
  const olaId       = id ?? ''
  const supervisorId = localStorage.getItem('user_id') ?? ''

  const { data: ola }                 = useOla(olaId)
  const { data, isLoading, isError }  = useLineasDespacho(olaId)
  const escanear                      = useEscanearLpnF3(olaId)
  const despachar                     = useDespacharOla()

  const [scanInput, setScanInput]         = useState('')
  const [error, setError]                 = useState<string | null>(null)
  const [filtro, setFiltro]               = useState<'pendientes' | 'validados' | 'todos'>('pendientes')
  const [lpnPendiente, setLpnPendiente]   = useState<{ lpn: string; lineas: LineaDespacho[] } | null>(null)
  const [confirmando, setConfirmando]     = useState(false)
  const [mostrarChofer, setChofer]        = useState(false)
  const [chofer, setChoferNombre]         = useState('')
  const [errorDespacho, setErrDesp]       = useState<string | null>(null)
  const [despachando, setDespachando]     = useState(false)
  const inputRef                          = useRef<HTMLInputElement>(null)

  const lineas = (data ?? []) as LineaDespacho[]

  const porLpn = lineas.reduce<Record<string, LineaDespacho[]>>((acc, l) => {
    ;(acc[l.lpn] ??= []).push(l)
    return acc
  }, {})
  const lpns        = Object.keys(porLpn).sort()
  const totalLpns   = lpns.length
  const validados   = lpns.filter(lpn => porLpn[lpn].every(l => l.fase3_validado)).length
  const pendientes  = totalLpns - validados
  const pct         = totalLpns > 0 ? Math.round((validados / totalLpns) * 100) : 0
  const todosOk     = totalLpns > 0 && validados === totalLpns

  const lpnsFiltrados = lpns.filter(lpn => {
    const ok = porLpn[lpn].every(l => l.fase3_validado)
    if (filtro === 'pendientes') return !ok
    if (filtro === 'validados')  return ok
    return true
  })

  function resolverLpn(valor: string): string | null {
    if (porLpn[valor]) return valor
    const scan = valor.replace(/^0+/, '')
    for (const key of lpns) {
      if (key.replace(/^0+/, '') === scan) return key
    }
    if (valor.length >= 4) {
      const sufijo = valor.slice(-5)
      const matches = lpns.filter(key => key.endsWith(sufijo))
      if (matches.length === 1) return matches[0]
    }
    return null
  }

  function handleEscanear(valor: string) {
    const raw = valor.trim()
    if (!raw) return
    setError(null)
    const lpn = resolverLpn(raw)
    if (!lpn) {
      setError(`LPN no encontrado. Ingresa el número impreso bajo el código de barras.`)
      setScanInput('')
      setTimeout(() => inputRef.current?.focus(), 50)
      return
    }
    const lineasLpn = porLpn[lpn]
    if (lineasLpn.every(l => l.fase3_validado)) {
      setError(`LPN ${lpn} ya fue validado`)
      setScanInput('')
      setTimeout(() => inputRef.current?.focus(), 50)
      return
    }
    setLpnPendiente({ lpn, lineas: lineasLpn })
    setScanInput('')
  }

  async function handleConfirmarLpn() {
    if (!lpnPendiente) return
    setConfirmando(true)
    try {
      await escanear.mutateAsync({ lpn: lpnPendiente.lpn, supervisorId })
      setLpnPendiente(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al confirmar LPN')
      setLpnPendiente(null)
    } finally {
      setConfirmando(false)
    }
  }

  async function handleDespachar() {
    if (!chofer.trim()) return
    setErrDesp(null)
    setDespachando(true)
    try {
      await despachar.mutateAsync({ olaId, supervisorId, nombreChofer: chofer.trim() })
      navigate('/picking-masivo')
    } catch (e) {
      setErrDesp(e instanceof ApiResponseError ? e.message : 'Error al despachar')
    } finally {
      setDespachando(false)
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
          <span className="sd-header-nombre">Validar Carga — {proveedor}</span>
          {ola?.fecha_entrega && (
            <span className="sd-header-meta">Entrega: {ola.fecha_entrega}</span>
          )}
        </div>
      </div>

      {/* ── Progreso ── */}
      <div className="cola-progreso-wrap">
        <div className="cola-progreso-meta">
          <span className="cola-progreso-label">PROGRESO FASE 3</span>
          <span className="cola-progreso-ratio">{validados} / {totalLpns} LPNs · {pct}%</span>
        </div>
        <div className="cola-progreso-bg">
          <div className="cola-progreso-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── Escáner ── */}
      {!todosOk && (
        <div className="prep-scanner-wrap">
          <div className="cf-scanner-header">
            <IcoScan />
            <span className="cf-scanner-label">Escanea el LPN para validar</span>
          </div>
          <div className="cf-scanner-input-row">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              className={`cf-scanner-input ${error ? 'cf-scanner-input--error' : ''}`}
              placeholder="Pistolear LPN aquí…"
              value={scanInput}
              autoFocus
              autoComplete="off"
              onChange={e => { setScanInput(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleEscanear(scanInput)}
            />
            <BarcodeScanner title="Escanear con cámara" onDetected={handleEscanear} />
          </div>
          <button
            className="cf-btn cf-btn--verify"
            disabled={!scanInput.trim() || escanear.isPending}
            onClick={() => handleEscanear(scanInput)}
          >
            {escanear.isPending ? 'Validando…' : 'Validar LPN'}
          </button>
          {error && <div className="cf-error-banner"><IcoWarn /> {error}</div>}
        </div>
      )}

      {/* ── Todos validados ── */}
      {todosOk && (
        <div className="cf-scan-ok" style={{ margin: '12px 16px', fontSize: '1rem' }}>
          <IcoCheck /> Orden lista para Despachar
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="sd-toolbar oc-toolbar">
        <div className="sd-filtros">
          {([
            ['pendientes', `Pendientes (${pendientes})`],
            ['validados',  `Validados (${validados})`],
            ['todos',      `Todos (${totalLpns})`],
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
      {isLoading && <p className="cargando">Cargando LPNs…</p>}
      {isError   && <p className="error-msg">Error al cargar los datos</p>}

      {!isLoading && !isError && lpnsFiltrados.length === 0 && (
        <div className="sd-vacio">
          {filtro === 'validados' ? 'Aún no hay LPNs validados' : 'Todos los LPNs están validados'}
        </div>
      )}

      {!isLoading && !isError && lpnsFiltrados.length > 0 && (
        <div className="prep-lpn-lista">
          {lpnsFiltrados.map(lpn => (
            <LpnCard key={lpn} lpn={lpn} lineas={porLpn[lpn]} />
          ))}
        </div>
      )}

      {/* ── Botón despachar ── */}
      {todosOk && (
        <div className="desp-despachar-wrap">
          <button
            className="desp-despachar-btn"
            onClick={() => setChofer(true)}
          >
            <IcoTruck />
            <span>Despachar Carga</span>
          </button>
        </div>
      )}

      {/* ── Modal: confirmar LPN ── */}
      {lpnPendiente && (
        <div className="modal-overlay" onClick={() => setLpnPendiente(null)}>
          <div className="desp-modal" onClick={e => e.stopPropagation()}>
            <h3 className="desp-modal-titulo">Confirmar bulto</h3>
            <div className="desp-modal-fila">
              <span className="desp-modal-label desp-modal-label--white">LPN</span>
              <span className="desp-modal-valor desp-modal-valor--mono desp-modal-valor--chip">{lpnPendiente.lpn}</span>
            </div>
            <div className="desp-modal-fila desp-modal-fila--sep">
              <span className="desp-modal-label desp-modal-label--white">Tienda destino</span>
              <span className="desp-modal-valor desp-modal-valor--white">{lpnPendiente.lineas[0]?.tienda ?? '—'}</span>
            </div>
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              {lpnPendiente.lineas.map(l => (
                <div key={l.id} className="desp-modal-fila">
                  <span className="desp-modal-valor desp-modal-valor--mono desp-modal-valor--chip" style={{ fontSize: '0.85rem' }}>{l.descripcion}</span>
                  <span className="desp-modal-valor desp-modal-valor--xl">{l.cantidad_solicitada} Uds</span>
                </div>
              ))}
            </div>
            <div className="desp-modal-acciones">
              <button className="desp-modal-btn desp-modal-btn--secondary" onClick={() => setLpnPendiente(null)}>
                Volver
              </button>
              <button
                className="desp-modal-btn desp-modal-btn--primary"
                disabled={confirmando}
                onClick={handleConfirmarLpn}
              >
                {confirmando ? 'Confirmando…' : 'Confirmar carga'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal chofer ── */}
      {mostrarChofer && (
        <div className="modal-overlay" onClick={() => { setChofer(false); setChoferNombre(''); setErrDesp(null) }}>
          <div className="desp-modal" onClick={e => e.stopPropagation()}>
            <h3 className="desp-modal-titulo">Confirmar despacho</h3>
            <p className="desp-modal-sub">Selecciona el chofer</p>
            <div className="desp-choferes">
              {['Darhyng Olea', 'Javier Arancibia', 'Jorge Alvarez', 'Gustavo Bunster'].map(c => (
                <button
                  key={c}
                  type="button"
                  className={`desp-chofer-btn ${chofer === c ? 'desp-chofer-btn--sel' : ''}`}
                  onClick={() => setChoferNombre(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            {errorDespacho && <p className="desp-scanner-error">{errorDespacho}</p>}
            <div className="desp-modal-acciones">
              <button
                className="desp-modal-btn desp-modal-btn--secondary"
                disabled={despachando}
                onClick={() => { setChofer(false); setChoferNombre(''); setErrDesp(null) }}
              >
                Cancelar
              </button>
              <button
                className="desp-modal-btn desp-modal-btn--primary"
                disabled={!chofer.trim() || despachando}
                onClick={handleDespachar}
              >
                {despachando ? 'Despachando…' : 'Confirmar despacho'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
