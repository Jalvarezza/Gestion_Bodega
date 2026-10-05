import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useColaSubtareas, useConfirmarSubtarea, useEditarParcial, useTomarSubtarea } from '../hooks/usePickingMasivo'
import { productosApi } from '../../productos/services/productos.api'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import { onlyNumbersKeyDown, onlyNumbersPaste } from '../../../shared/utils/numericInput'
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

// ── Pantalla post-confirmación LPN ────────────────────────────────────────────

function LpnConfirmadoScreen({ lpn, onNext }: { lpn: string; onNext: () => void }) {
  return (
    <div className="cf-lpn-wrap">
      <div className="cf-lpn-check"><IcoCheck /></div>
      <p className="cf-lpn-titulo">Producto confirmado</p>
      <p className="cf-lpn-label">Etiqueta el bulto con este LPN:</p>
      <div className="cf-lpn-codigo">{lpn}</div>
      <button className="cf-btn cf-btn--primary cf-btn--xl" onClick={onNext}>
        Siguiente producto →
      </button>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export function ConfirmarSubtareaPage() {
  const { id: sesionId, subtareaId } = useParams<{ id: string; subtareaId: string }>()
  const navigate   = useNavigate()
  const operadorId = localStorage.getItem('user_id') ?? ''
  const rol        = localStorage.getItem('user_rol') ?? ''

  const { data, isLoading }  = useColaSubtareas(sesionId ?? null)
  const confirmarSubtarea    = useConfirmarSubtarea(sesionId ?? '')
  const editarParcial        = useEditarParcial(sesionId ?? '')
  const tomarSubtarea        = useTomarSubtarea(sesionId ?? '')

  const [autoTomando, setAutoTomando]       = useState(false)
  const [autoTomadoError, setAutoTomadoError] = useState<string | null>(null)

  const subtarea           = (data ?? []).find(s => s.id === subtareaId)
  const esParcialEditable  = subtarea?.estado === 'parcial' || subtarea?.estado === 'sin_stock'

  // Auto-tomar si la subtarea existe pero no está bloqueada por este operador
  useEffect(() => {
    if (!subtarea || !subtareaId) return
    if (subtarea.estado === 'completado') return
    const esMia = subtarea.estado === 'bloqueado' && subtarea.bloqueado_por === operadorId
    if (esMia) return
    if (subtarea.estado === 'bloqueado') {
      setAutoTomadoError('Esta subtarea está siendo procesada por otro operador.')
      return
    }
    // estado 'libre' o 'parcial'/'sin_stock' sin bloqueo → auto-tomar
    setAutoTomando(true)
    setAutoTomadoError(null)
    tomarSubtarea.mutateAsync({ subtareaId, usuarioId: operadorId })
      .then(() => setAutoTomando(false))
      .catch(() => {
        setAutoTomando(false)
        setAutoTomadoError('No se pudo tomar la subtarea. Vuelve a la cola e inténtalo de nuevo.')
      })
  }, [subtarea?.id, subtarea?.estado, subtarea?.bloqueado_por])
  const item               = subtarea?.items_picking_masivo
  const codigoBarra        = item?.codigo_barra?.trim() || null
  const lpn                = item?.lpn ?? null

  const [lpnConfirmado, setLpnConfirmado]         = useState<string | null>(null)
  const [barcode, setBarcode]                     = useState('')
  const [barcodeOk, setBarcodeOk]                 = useState(false)
  const [sinStockMode, setSinStockMode]           = useState(false)
  const [cantidad, setCantidad]                   = useState('')
  const [motivo, setMotivo]                       = useState('')
  const [equivalenteActivo, setEquivalenteActivo] = useState(false)
  const [opcionesEq, setOpcionesEq]               = useState<ProductoBase[]>([])
  const [equivalenteSel, setEquivalenteSel]       = useState<ProductoBase | null>(null)
  const [loadingEq, setLoadingEq]                 = useState(false)
  const [error, setError]                         = useState<string | null>(null)
  const [validandoBarcode, setValidandoBarcode]   = useState(false)

  const barcodeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!subtarea) return
    if (esParcialEditable) {
      setCantidad(String(subtarea.cantidad_despachada ?? ''))
      setMotivo(subtarea.motivo_diferencia ?? '')
    } else {
      setCantidad(String(subtarea.cantidad_asignada))
    }
    if (item && !item.codigo_barra) {
      setBarcodeOk(true)
    } else {
      setBarcodeOk(false)
      setBarcode('')
      setTimeout(() => barcodeRef.current?.focus(), 100)
    }
  }, [subtarea?.id])

  useEffect(() => {
    if (!equivalenteActivo || !item?.codigo) { setOpcionesEq([]); return }
    let vigente = true
    setLoadingEq(true)
    productosApi.getBySku(item.codigo)
      .then(res => { if (vigente) setOpcionesEq(res.equivalentes) })
      .catch(() => { if (vigente) setOpcionesEq([]) })
      .finally(() => { if (vigente) setLoadingEq(false) })
    return () => { vigente = false }
  }, [equivalenteActivo, item?.codigo])

  async function handleValidarBarcode(val: string) {
    if (!val.trim()) return
    const targetEan = equivalenteSel?.codigo_barra ?? item?.codigo_barra ?? null
    if (!targetEan) { setBarcodeOk(true); setError(null); return }
    const norm = (s: string) => s.replace(/^0+/, '')
    if (norm(val.trim()) === norm(targetEan)) { setBarcodeOk(true); setError(null) }
    else setError('Código incorrecto. Escanea el producto correcto.')
  }

  function handleBarcodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, '')
    setBarcode(val)
    setBarcodeOk(false)
    setError(null)
  }

  function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleValidarBarcode(barcode)
  }

  async function confirmar(cantidadFinal: number, motivoFinal: string | undefined) {
    if (!sesionId) return
    setError(null)
    try {
      if (esParcialEditable) {
        await editarParcial.mutateAsync({ subtareaId: subtarea!.id, usuarioId: operadorId, cantidadDespachada: cantidadFinal, motivo: motivoFinal })
      } else {
        await confirmarSubtarea.mutateAsync({ subtareaId: subtarea!.id, usuarioId: operadorId, cantidadDespachada: cantidadFinal, motivo: motivoFinal, productoRealId: equivalenteSel?.id })
      }
      if (lpn && cantidadFinal > 0) {
        setLpnConfirmado(lpn)
      } else {
        navigate(`/picking-masivo/operador/${sesionId}`)
      }
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al confirmar la subtarea')
    }
  }

  function handleConfirmarDespacho() {
    if (!barcodeOk)                              { setError('Escanea el producto primero'); return }
    if (cantNum <= 0)                            { setError('Ingresa una cantidad válida'); return }
    if (cantNum > cantAsignada)                  { setError(`No puedes despachar más de lo asignado (${cantAsignada})`); return }
    if (cantNum < cantAsignada && !motivo.trim()) { setError('El motivo es obligatorio para despacho parcial'); return }
    confirmar(cantNum, cantNum < cantAsignada ? motivo.trim() : undefined)
  }

  function handleSinStock() {
    if (!motivo.trim()) { setError('Indica el motivo de la falta de stock'); return }
    confirmar(0, motivo.trim())
  }

  // ── Early returns ──
  if (autoTomando) return (
    <div className="cf-page">
      <p className="cargando">Tomando subtarea…</p>
    </div>
  )
  if (autoTomadoError) return (
    <div className="cf-page">
      <div className="cf-error-banner" style={{ margin: '2rem auto', maxWidth: 480 }}>
        <IcoWarn /> {autoTomadoError}
      </div>
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <button className="cf-volver-btn" onClick={() => navigate(`/picking-masivo/operador/${sesionId}`)}>
          <IcoBack /> Volver a la Cola
        </button>
      </div>
    </div>
  )
  if (lpnConfirmado) {
    return (
      <div className="cf-page">
        <LpnConfirmadoScreen lpn={lpnConfirmado} onNext={() => navigate(`/picking-masivo/operador/${sesionId}`)} />
      </div>
    )
  }
  if (isLoading) return <div className="cf-page"><p className="cargando">Cargando…</p></div>
  if (!subtarea)  return <div className="cf-page"><p className="error-msg">Subtarea no encontrada o ya procesada</p></div>

  const cantAsignada = subtarea.cantidad_asignada
  const cantNum      = parseInt(cantidad, 10) || 0
  const requiereMotivo = cantNum < cantAsignada
  const isPending    = confirmarSubtarea.isPending || editarParcial.isPending

  const oc      = subtarea.items_picking_masivo?.lpn ?? ''
  const desc    = equivalenteSel
    ? `${equivalenteSel.sku}${equivalenteSel.nombre && equivalenteSel.nombre !== equivalenteSel.sku ? ` — ${equivalenteSel.nombre}` : ''}`
    : `${item?.descripcion ?? item?.codigo ?? ''}`
  const sku     = equivalenteSel ? equivalenteSel.sku : (item?.codigo ?? '')
  const ean     = equivalenteSel?.codigo_barra ?? codigoBarra

  return (
    <div className="cf-page">

      {/* ── Cabecera ── */}
      <div className="cf-header">
        <button className="cf-volver-btn" onClick={() => navigate(`/picking-masivo/operador/${sesionId}`)}>
          <IcoBack /> Volver a la Cola
        </button>
        <div className="cf-ctx-bar">
          {subtarea.posicion_codigo && subtarea.posicion_codigo !== '—' && (
            <span className="cf-ctx-pill">
              <IcoPin /> {subtarea.posicion_codigo}
            </span>
          )}
          {lpn && (
            <span className="cf-ctx-pill cf-ctx-pill--lpn">
              LPN Destino: <strong>{lpn}</strong>
            </span>
          )}
          {esParcialEditable && (
            <span className="cf-ctx-pill cf-ctx-pill--warn">Editando parcial</span>
          )}
        </div>
      </div>

      {/* ── Bloques de contexto: Ubicación + Producto ── */}
      <div className="cf-context-grid">

        <div className="cf-context-block cf-context-block--rack">
          <span className="cf-block-label"><IcoPin /> RACK / UBICACIÓN</span>
          <span className="cf-rack-codigo">
            {subtarea.posicion_codigo !== '—' ? subtarea.posicion_codigo : '— Sin ubicación —'}
          </span>
        </div>

        <div className="cf-context-block cf-context-block--producto">
          <span className="cf-block-label"><IcoBox /> PRODUCTO</span>
          <span className="cf-prod-desc">{desc || '—'}</span>
          <div className="cf-prod-codes">
            <span className="cf-sku-tag">SKU: {sku}</span>
            {ean && <span className="cf-ean-tag">EAN: {ean}</span>}
          </div>
        </div>
      </div>

      {/* ── Cantidad solicitada ── */}
      <div className="cf-solicitado">
        <span className="cf-solicitado-label">CANTIDAD SOLICITADA</span>
        <span className="cf-solicitado-val">{cantAsignada}<span className="cf-solicitado-unit"> Uds</span></span>
      </div>

      {error && (
        <div className="cf-error-banner">
          <IcoWarn /> {error}
        </div>
      )}

      {/* ── Bloque escáner ── */}
      {!barcodeOk && !sinStockMode && (
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
              onChange={handleBarcodeChange}
              onKeyDown={handleBarcodeKeyDown}
              autoComplete="off"
              disabled={validandoBarcode}
            />
            <BarcodeScanner
              title="Escanear con cámara"
              onDetected={codigo => { setBarcode(codigo); handleValidarBarcode(codigo) }}
            />
          </div>
          <button
            className="cf-btn cf-btn--verify"
            disabled={!barcode.trim() || validandoBarcode}
            onClick={() => handleValidarBarcode(barcode)}
          >
            {validandoBarcode ? 'Validando…' : 'Verificar código'}
          </button>
        </div>
      )}

      {/* ── Escaneado OK ── */}
      {barcodeOk && !sinStockMode && (
        <div className="cf-scan-ok">
          <IcoCheck /> Producto escaneado correctamente
        </div>
      )}

      {/* ── Sin stock: solo motivo ── */}
      {sinStockMode && (
        <div className="cf-sinstock-section">
          <div className="cf-sinstock-banner">
            <IcoWarn /> Sin stock — se registrará como 0 unidades despachadas
          </div>
          <label className="cf-label">
            Motivo (obligatorio)
            <textarea
              className="cf-textarea"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Motivo de falta de stock…"
              autoFocus
            />
          </label>
        </div>
      )}

      {/* ── Control de cantidad ── */}
      {barcodeOk && !sinStockMode && (
        <div className="cf-cantidad-section">

          {/* Selector de cantidad */}
          <div className="cf-qty-control">
            <button
              className="cf-qty-btn"
              disabled={cantNum <= 0}
              onClick={() => setCantidad(String(Math.max(0, cantNum - 1)))}
            >−</button>
            <input
              type="number"
              className="cf-qty-input"
              inputMode="numeric"
              min={0}
              max={cantAsignada}
              value={cantidad}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '')
                setCantidad(v)
                setError(null)
              }}
              onKeyDown={onlyNumbersKeyDown}
              onPaste={onlyNumbersPaste}
            />
            <button
              className="cf-qty-btn"
              disabled={cantNum >= cantAsignada}
              onClick={() => setCantidad(String(Math.min(cantAsignada, cantNum + 1)))}
            >+</button>
            <button
              className="cf-qty-btn cf-qty-btn--max"
              disabled={cantNum === cantAsignada}
              onClick={() => setCantidad(String(cantAsignada))}
            >Max</button>
          </div>

          {requiereMotivo && (
            <label className="cf-label">
              Motivo de diferencia (obligatorio)
              <textarea
                className="cf-textarea"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Motivo de la diferencia…"
              />
            </label>
          )}

          <button
            className="cf-carga-total-btn cf-carga-total-btn--confirm"
            disabled={isPending}
            onClick={handleConfirmarDespacho}
          >
            {isPending ? 'Confirmando…' : esParcialEditable ? 'Guardar cambio' : 'Confirmar cantidad'}
          </button>

        </div>
      )}

      {/* ── Panel de equivalentes ── */}
      {equivalenteActivo && !sinStockMode && (
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
      {equivalenteSel && !sinStockMode && (
        <div className="cf-equivalente-activo-banner">
          <IcoTool />
          <span>Equivalente: <strong>{equivalenteSel.sku}</strong></span>
          <button
            className="cf-equivalente-quitar"
            onClick={() => { setEquivalenteSel(null); setBarcodeOk(false); setBarcode(''); setTimeout(() => barcodeRef.current?.focus(), 100) }}
          >
            Quitar
          </button>
        </div>
      )}

      {/* ── Acciones principales ── */}
      <div className="cf-acciones">

        {/* Sin stock: confirmar o cancelar */}
        {sinStockMode && (
          <>
            <button
              className="cf-btn cf-btn--sinstock cf-btn--xl"
              disabled={isPending || !motivo.trim()}
              onClick={handleSinStock}
            >
              <IcoWarn />
              {isPending ? 'Registrando…' : 'CONFIRMAR SIN STOCK'}
            </button>
            <button
              className="cf-btn cf-btn--secondary"
              disabled={isPending}
              onClick={() => { setSinStockMode(false); setMotivo(''); setError(null) }}
            >
              Cancelar
            </button>
          </>
        )}

        {/* Equivalente — siempre visible en modo normal */}
        {!sinStockMode && !esParcialEditable && (
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
        )}

        {/* Reportar sin stock (desde modo normal) */}
        {!sinStockMode && (
          <button
            className="cf-btn cf-btn--warn"
            onClick={() => { setSinStockMode(true); setError(null) }}
          >
            <IcoWarn /> Reportar sin stock
          </button>
        )}
      </div>
    </div>
  )
}
