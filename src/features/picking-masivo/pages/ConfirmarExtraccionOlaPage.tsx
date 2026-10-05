import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useColaExtraccion, useConfirmarExtraccion, useTomarTarea } from '../hooks/useOlas'
import { productosApi } from '../../productos/services/productos.api'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import { BarcodeScanner } from '../../../shared/components/BarcodeScanner'
import type { ProductoConEquivalentes } from '../../../shared/types/servicios'

type ProductoBase = ProductoConEquivalentes['equivalentes'][number]

// ── Íconos ────────────────────────────────────────────────────────────────────

function IcoBack() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="15 18 9 12 15 6"/></svg>
}
function IcoPin() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
}
function IcoBox() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
}
function IcoCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><polyline points="20 6 9 17 4 12"/></svg>
}
function IcoWarn() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
}
function IcoTool() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
}
function IcoScan() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="7" y2="12.01"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="17" y1="12" x2="17" y2="12.01"/></svg>
}

// ── Página ────────────────────────────────────────────────────────────────────

export function ConfirmarExtraccionOlaPage() {
  const { id: olaId, tareaId } = useParams<{ id: string; tareaId: string }>()
  const navigate    = useNavigate()
  const operadorId  = localStorage.getItem('user_id') ?? ''

  const { data, isLoading }  = useColaExtraccion(olaId ?? null)
  const tomarTarea            = useTomarTarea(olaId ?? '')
  const confirmar             = useConfirmarExtraccion(olaId ?? '')

  const tarea = (data ?? []).find(t => t.id === tareaId)

  const [autoTomando, setAutoTomando]           = useState(false)
  const [autoTomadoError, setAutoTomadoError]   = useState<string | null>(null)

  // Auto-tomar si no es mía
  useEffect(() => {
    if (!tarea || !tareaId) return
    if (tarea.estado === 'completado') return
    const esMia = tarea.estado === 'bloqueado' && tarea.bloqueado_por === operadorId
    if (esMia) return
    if (tarea.estado === 'bloqueado') {
      setAutoTomadoError('Esta tarea está siendo procesada por otro operador.')
      return
    }
    setAutoTomando(true)
    tomarTarea.mutateAsync({ tareaId, usuarioId: operadorId })
      .then(() => setAutoTomando(false))
      .catch(() => {
        setAutoTomando(false)
        setAutoTomadoError('No se pudo tomar la tarea. Vuelve e inténtalo de nuevo.')
      })
  }, [tarea?.id, tarea?.estado, tarea?.bloqueado_por])

  const codigoBarra = tarea?.codigo_barra?.trim() || null
  const ruta        = tarea?.ruta_sugerida ?? []
  const primerRack  = ruta[0]?.posicion_codigo ?? null

  // ── Estado formulario ──
  const [barcode, setBarcode]                     = useState('')
  const [barcodeOk, setBarcodeOk]                 = useState(false)
  const [cantidad, setCantidad]                   = useState('')
  const [error, setError]                         = useState<string | null>(null)
  const [confirmando, setConf]                    = useState(false)

  // ── Estado equivalentes ──
  const [equivalenteActivo, setEquivalenteActivo] = useState(false)
  const [opcionesEq, setOpcionesEq]               = useState<ProductoBase[]>([])
  const [equivalenteSel, setEquivalenteSel]       = useState<ProductoBase | null>(null)
  const [loadingEq, setLoadingEq]                 = useState(false)

  // ── Estado sin stock ──
  const [sinStockMode, setSinStockMode]           = useState(false)

  const barcodeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!tarea) return
    const targetEan = equivalenteSel?.codigo_barra ?? codigoBarra
    if (!targetEan) { setBarcodeOk(true); return }
    setBarcodeOk(false)
    setBarcode('')
    setTimeout(() => barcodeRef.current?.focus(), 100)
  }, [tarea?.id, equivalenteSel?.id])

  // Cargar equivalentes cuando el panel está activo
  useEffect(() => {
    if (!equivalenteActivo || !tarea) { setOpcionesEq([]); return }
    let vigente = true
    setLoadingEq(true)
    // Buscar por codigo_barra del producto
    const ean = tarea.codigo_barra
    if (!ean) { setOpcionesEq([]); setLoadingEq(false); return }
    productosApi.getByCodigoBarra(ean)
      .then(res => { if (vigente) setOpcionesEq(res?.equivalentes ?? []) })
      .catch(() => { if (vigente) setOpcionesEq([]) })
      .finally(() => { if (vigente) setLoadingEq(false) })
    return () => { vigente = false }
  }, [equivalenteActivo, tarea?.id])

  function handleScan(val: string) {
    const v = val.replace(/\D/g, '')
    setBarcode(v)
    setBarcodeOk(false)
    setError(null)
  }

  function validarBarcode(val: string) {
    const targetEan = equivalenteSel?.codigo_barra ?? codigoBarra
    if (!targetEan) { setBarcodeOk(true); setError(null); return }
    const norm = (s: string) => s.replace(/^0+/, '')
    if (norm(val.trim()) === norm(targetEan)) { setBarcodeOk(true); setError(null) }
    else setError('Código incorrecto. Escanea el producto correcto.')
  }

  async function handleConfirmar() {
    const cant = parseInt(cantidad, 10)
    if (!Number.isFinite(cant) || cant < 0) { setError('Ingresa una cantidad válida'); return }
    if (cant > (tarea?.cantidad_total ?? 0)) { setError(`Máximo ${tarea?.cantidad_total} unidades`); return }
    setError(null)
    setConf(true)
    try {
      await confirmar.mutateAsync({ tareaId: tarea!.id, usuarioId: operadorId, cantidadExtraida: cant })
      navigate(`/picking-masivo/ola/${olaId}/extraccion`)
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al confirmar')
    } finally {
      setConf(false)
    }
  }

  async function handleSinStock() {
    setConf(true)
    setError(null)
    try {
      await confirmar.mutateAsync({ tareaId: tarea!.id, usuarioId: operadorId, cantidadExtraida: 0 })
      navigate(`/picking-masivo/ola/${olaId}/extraccion`)
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al reportar sin stock')
    } finally {
      setConf(false)
    }
  }

  const esMia = tarea?.estado === 'bloqueado' && tarea?.bloqueado_por === operadorId

  // ── Early returns ──
  if (autoTomando) return <div className="cf-page"><p className="cargando">Tomando tarea…</p></div>
  if (autoTomadoError) return (
    <div className="cf-page">
      <div className="cf-error-banner" style={{ margin: '2rem auto', maxWidth: 480 }}>
        <IcoWarn /> {autoTomadoError}
      </div>
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <button className="cf-volver-btn" onClick={() => navigate(`/picking-masivo/ola/${olaId}/extraccion`)}>
          <IcoBack /> Volver
        </button>
      </div>
    </div>
  )
  if (isLoading) return <div className="cf-page"><p className="cargando">Cargando…</p></div>
  if (!tarea)    return <div className="cf-page"><p className="error-msg">Tarea no encontrada</p></div>
  if (tarea.estado === 'completado') return (
    <div className="cf-page">
      <div className="cf-error-banner" style={{ margin: '2rem auto', maxWidth: 480, background: 'var(--color-ok-bg, #d1fae5)', borderColor: 'var(--color-ok, #10b981)', color: 'var(--color-ok, #065f46)' }}>
        <IcoCheck /> Esta tarea ya fue completada.
      </div>
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <button className="cf-volver-btn" onClick={() => navigate(`/picking-masivo/ola/${olaId}/extraccion`)}>
          <IcoBack /> Volver
        </button>
      </div>
    </div>
  )
  if (tarea.estado === 'bloqueado' && !esMia) return (
    <div className="cf-page">
      <div className="cf-error-banner" style={{ margin: '2rem auto', maxWidth: 480 }}>
        <IcoWarn /> Esta tarea está siendo procesada por otro operador.
      </div>
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <button className="cf-volver-btn" onClick={() => navigate(`/picking-masivo/ola/${olaId}/extraccion`)}>
          <IcoBack /> Volver
        </button>
      </div>
    </div>
  )

  const cantTotal = tarea.cantidad_total
  const cantNum   = parseInt(cantidad, 10) || 0

  const eanActivo = equivalenteSel?.codigo_barra ?? codigoBarra

  return (
    <div className="cf-page">

      {/* ── Cabecera ── */}
      <div className="cf-header">
        <button className="cf-volver-btn" onClick={() => navigate(`/picking-masivo/ola/${olaId}/extraccion`)}>
          <IcoBack /> Volver
        </button>
        <div className="cf-ctx-bar">
          {primerRack && (
            <span className="cf-ctx-pill"><IcoPin /> {primerRack}</span>
          )}
        </div>
      </div>

      {/* ── Contexto: Rack + Producto ── */}
      <div className="cf-context-grid">
        <div className="cf-context-block cf-context-block--rack">
          <span className="cf-block-label"><IcoPin /> RACK / UBICACIÓN</span>
          <span className="cf-rack-codigo">
            {primerRack ?? '— Sin ubicación —'}
          </span>
        </div>
        <div className="cf-context-block cf-context-block--producto">
          <span className="cf-block-label"><IcoBox /> PRODUCTO</span>
          <span className="cf-prod-desc">
            {equivalenteSel
              ? `${equivalenteSel.sku}${equivalenteSel.nombre && equivalenteSel.nombre !== equivalenteSel.sku ? ` — ${equivalenteSel.nombre}` : ''}`
              : (tarea.descripcion || '—')
            }
          </span>
          <div className="cf-prod-codes">
            {eanActivo && <span className="cf-ean-tag">EAN: {eanActivo}</span>}
          </div>
        </div>
      </div>

      {/* ── Cantidad solicitada ── */}
      <div className="cf-solicitado">
        <span className="cf-solicitado-label">CANTIDAD SOLICITADA</span>
        <span className="cf-solicitado-val">{cantTotal}<span className="cf-solicitado-unit"> Uds</span></span>
      </div>

      {error && <div className="cf-error-banner"><IcoWarn /> {error}</div>}

      {/* ── Modo sin stock ── */}
      {sinStockMode ? (
        <div className="cf-acciones">
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>
            Se registrará <strong>0 unidades extraídas</strong> para este SKU.
          </p>
          <button
            className="cf-btn cf-btn--sinstock cf-btn--xl"
            disabled={confirmando}
            onClick={handleSinStock}
          >
            <IcoWarn /> {confirmando ? 'Registrando…' : 'CONFIRMAR SIN STOCK'}
          </button>
          <button
            className="cf-btn cf-btn--secondary"
            disabled={confirmando}
            onClick={() => { setSinStockMode(false); setError(null) }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <>
          {/* ── Panel de equivalentes ── */}
          {equivalenteActivo && (
            <div className="cf-equivalente-panel">
              <div className="cf-equivalente-panel-header">
                <span className="cf-equivalente-panel-titulo">Selecciona el equivalente</span>
                <button className="cf-equivalente-panel-cerrar" onClick={() => setEquivalenteActivo(false)}>✕</button>
              </div>
              {loadingEq && <p className="cargando" style={{ padding: '12px 0' }}>Buscando equivalentes…</p>}
              {!loadingEq && opcionesEq.length === 0 && (
                <p className="cf-equivalente-vacio">Sin equivalentes registrados para este SKU</p>
              )}
              {!loadingEq && opcionesEq.map(p => (
                <button
                  key={p.id}
                  className={`cf-eq-card ${equivalenteSel?.id === p.id ? 'cf-eq-card--sel' : ''}`}
                  onClick={() => {
                    setEquivalenteSel(p)
                    setEquivalenteActivo(false)
                    setBarcodeOk(false)
                    setBarcode('')
                    setError(null)
                    setTimeout(() => barcodeRef.current?.focus(), 100)
                  }}
                >
                  <span className="cf-eq-sku">{p.sku}</span>
                  {p.nombre && p.nombre !== p.sku && <span className="cf-eq-nombre">{p.nombre}</span>}
                  {p.codigo_barra && <span className="cf-eq-ean">EAN: {p.codigo_barra}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Banner: equivalente activo */}
          {equivalenteSel && (
            <div className="cf-equivalente-activo-banner">
              <IcoTool />
              <span>Equivalente: <strong>{equivalenteSel.sku}</strong></span>
              <button
                className="cf-equivalente-quitar"
                onClick={() => {
                  setEquivalenteSel(null)
                  setBarcodeOk(false)
                  setBarcode('')
                  setTimeout(() => barcodeRef.current?.focus(), 100)
                }}
              >
                Quitar
              </button>
            </div>
          )}

          {/* ── Escáner ── */}
          {!barcodeOk && (
            <div className="cf-scanner-section">
              <div className="cf-scanner-header">
                <span className="cf-scanner-label">Escanea el código de barra del producto</span>
              </div>
              <div className="cf-scanner-input-row">
                <input
                  ref={barcodeRef}
                  type="text"
                  inputMode="numeric"
                  className={`cf-scanner-input ${error && !barcodeOk ? 'cf-scanner-input--error' : ''}`}
                  placeholder="Pistolear EAN / Código de Barra aquí…"
                  value={barcode}
                  onChange={e => handleScan(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && validarBarcode(barcode)}
                  autoComplete="off"
                />
                <BarcodeScanner
                  title="Escanear con cámara"
                  onDetected={codigo => { setBarcode(codigo); validarBarcode(codigo) }}
                />
              </div>
              <button
                className="cf-btn cf-btn--verify"
                disabled={!barcode.trim()}
                onClick={() => validarBarcode(barcode)}
              >
                Verificar código
              </button>
            </div>
          )}

          {barcodeOk && (
            <div className="cf-scan-ok"><IcoCheck /> Producto escaneado correctamente</div>
          )}

          {/* ── Control de cantidad ── */}
          {barcodeOk && (
            <div className="cf-cantidad-section">
              <p className="cf-cantidad-label">Ingrese cantidad:</p>
              <div className="cf-qty-control">
                <button className="cf-qty-btn" disabled={cantNum <= 0}
                  onClick={() => setCantidad(String(Math.max(0, cantNum - 1)))}>−</button>
                <input
                  type="number"
                  className="cf-qty-input"
                  inputMode="numeric"
                  min={0}
                  max={cantTotal}
                  value={cantidad}
                  onChange={e => { setCantidad(e.target.value.replace(/\D/g, '')); setError(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleConfirmar()}
                />
                <button className="cf-qty-btn" disabled={cantNum >= cantTotal}
                  onClick={() => setCantidad(String(Math.min(cantTotal, cantNum + 1)))}>+</button>
                <button className="cf-qty-btn cf-qty-btn--max" disabled={cantNum === cantTotal}
                  onClick={() => setCantidad(String(cantTotal))}>Max</button>
              </div>

              <button
                className="cf-carga-total-btn cf-carga-total-btn--confirm"
                disabled={confirmando || !cantidad}
                onClick={handleConfirmar}
              >
                {confirmando ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          )}

          {/* ── Acciones secundarias ── */}
          <div className="cf-acciones">
            <button
              className={`cf-btn cf-btn--equivalente ${equivalenteActivo ? 'cf-btn--equivalente-activo' : ''}`}
              onClick={() => {
                setEquivalenteActivo(v => !v)
                if (equivalenteActivo) return
                setEquivalenteSel(null)
                setOpcionesEq([])
              }}
            >
              <IcoScan /> {equivalenteActivo ? 'Cerrar equivalente' : 'Ver equivalente'}
            </button>
            <button
              className="cf-btn cf-btn--warn"
              onClick={() => { setSinStockMode(true); setError(null) }}
            >
              <IcoWarn /> Reportar sin stock
            </button>
          </div>
        </>
      )}
    </div>
  )
}
