import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLineasPreparacion, useEscanearLpnF2 } from '../hooks/useOlas'
import { ApiResponseError } from '../../../shared/utils/apiClient'

// ── Íconos ────────────────────────────────────────────────────────────────────

function IcoBack() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="15 18 9 12 15 6"/></svg>
}
function IcoCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><polyline points="20 6 9 17 4 12"/></svg>
}
function IcoWarn() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
}
function IcoStore() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function IcoBox() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
}

// ── Página ────────────────────────────────────────────────────────────────────

export function ConfirmarLpnPage() {
  const { id: olaId, lpn: lpnParam } = useParams<{ id: string; lpn: string }>()
  const navigate    = useNavigate()
  const operadorId  = localStorage.getItem('user_id') ?? ''

  const lpn = decodeURIComponent(lpnParam ?? '')

  const { data, isLoading } = useLineasPreparacion(olaId ?? null)
  const escanear            = useEscanearLpnF2(olaId ?? '')

  const [confirmando, setConf]  = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const lineas     = (data ?? []).filter(l => l.lpn === lpn)
  const tienda     = lineas[0]?.tienda ?? '—'
  const orden      = lineas[0]?.ola_ordenes?.numero_orden ?? null
  const totalUds   = lineas.reduce((s, l) => s + l.cantidad_solicitada, 0)
  const yaListo    = lineas.length > 0 && lineas.every(l => l.fase2_escaneado)

  async function handleConfirmar() {
    setError(null)
    setConf(true)
    try {
      await escanear.mutateAsync({ lpn, usuarioId: operadorId })
      navigate(`/picking-masivo/ola/${olaId}/preparacion`)
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al confirmar LPN')
    } finally {
      setConf(false)
    }
  }

  if (isLoading) return <div className="cf-page"><p className="cargando">Cargando…</p></div>
  if (lineas.length === 0) return (
    <div className="cf-page">
      <p className="error-msg">LPN {lpn} no encontrado en esta ola</p>
      <button className="cf-volver-btn" style={{ marginTop: 16 }}
        onClick={() => navigate(`/picking-masivo/ola/${olaId}/preparacion`)}>
        <IcoBack /> Volver
      </button>
    </div>
  )

  return (
    <div className="cf-page">

      {/* ── Cabecera ── */}
      <div className="cf-header">
        <button className="cf-volver-btn"
          onClick={() => navigate(`/picking-masivo/ola/${olaId}/preparacion`)}>
          <IcoBack /> Volver
        </button>
      </div>

      {/* ── Bloque LPN ── */}
      <div className="clpn-context-grid">
        <div className="cf-context-block cf-context-block--rack">
          <span className="cf-block-label"><IcoBox /> LPN</span>
          <span className="cf-rack-codigo" style={{ fontSize: '0.9rem', letterSpacing: '0.02em', color: 'var(--text-primary)' }}>
            {lpn}
          </span>
          {orden && (
            <span className="cf-sku-tag" style={{ marginTop: 6, background: 'color-mix(in srgb, #22c55e 18%, transparent)', color: '#22c55e', border: '1px solid color-mix(in srgb, #22c55e 40%, transparent)' }}>
              OC: {orden}
            </span>
          )}
        </div>
        <div className="cf-context-block cf-context-block--producto">
          <span className="cf-block-label"><IcoStore /> TIENDA DESTINO</span>
          <span className="cf-prod-desc">{tienda}</span>
        </div>
        <div className="clpn-col-derecha">
          {lineas.length === 1 ? (
            <>
              <div className="cf-context-block cf-context-block--producto clpn-sub-card">
                <span className="cf-block-label">CÓDIGO</span>
                <span className="clpn-val">{lineas[0].descripcion}</span>
              </div>
              <div className="cf-context-block cf-context-block--producto clpn-sub-card">
                <span className="cf-block-label">CANTIDAD</span>
                <span className="clpn-val">{lineas[0].cantidad_solicitada}</span>
              </div>
            </>
          ) : (
            lineas.map(l => (
              <div key={l.id} className="cf-context-block cf-context-block--producto clpn-sub-card">
                <span className="cf-block-label">CÓDIGO</span>
                <span className="clpn-val" style={{ fontSize: '0.9rem' }}>{l.descripcion}</span>
                <span className="cf-block-label" style={{ marginTop: 6 }}>CANTIDAD</span>
                <span className="clpn-val">{l.cantidad_solicitada}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {error && <div className="cf-error-banner"><IcoWarn /> {error}</div>}

      {/* ── Confirmar ── */}
      {yaListo ? (
        <div className="cf-scan-ok" style={{ fontSize: '1rem', padding: '16px' }}>
          <IcoCheck /> Este LPN ya fue confirmado
        </div>
      ) : (
        <button
          className="cf-carga-total-btn cf-carga-total-btn--confirm"
          disabled={confirmando}
          onClick={handleConfirmar}
        >
          {confirmando ? 'Guardando…' : 'Confirmar Productos'}
        </button>
      )}
    </div>
  )
}
