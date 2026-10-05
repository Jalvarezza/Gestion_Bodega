import { useState, useRef, useEffect, useCallback } from 'react'
import { useResolverPosicion, useResolverProducto, useRegistrarLoteInicial, useEliminarLoteInicial, useBuscarLotePorPosicion } from '../hooks/useInventarioInicial'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import { BarcodeScanner } from '../../../shared/components/BarcodeScanner'

type RegistroSesion = {
  id:        string
  hora:      string
  ubicacion: string
  sku:       string
  nombre:    string
  cantidad:  number
  ok:        boolean
}

type Props = { usuarioId: string }

function beepOk() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 880; g.gain.setValueAtTime(0.3, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    o.start(); o.stop(ctx.currentTime + 0.18)
  } catch {}
}

function beepError() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sawtooth'; o.frequency.value = 200
    g.gain.setValueAtTime(0.25, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    o.start(); o.stop(ctx.currentTime + 0.35)
  } catch {}
}

export function CargaPosicionFlow({ usuarioId }: Props) {
  const [codPosicion,  setCodPosicion]  = useState('')
  const [codProducto,  setCodProducto]  = useState('')
  const [fijarPos,     setFijarPos]     = useState(false)
  const [posInfo,      setPosInfo]      = useState<{ id: string; codigo: string; detalle: string } | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [cargando,     setCargando]     = useState(false)
  const [registros,    setRegistros]    = useState<RegistroSesion[]>([])
  const [totalHoy,     setTotalHoy]     = useState(0)

  const posRef  = useRef<HTMLInputElement>(null)
  const prodRef = useRef<HTMLInputElement>(null)

  const resolverPos  = useResolverPosicion()
  const resolverProd = useResolverProducto()
  const registrar    = useRegistrarLoteInicial()
  const eliminar     = useEliminarLoteInicial()
  const buscarLote   = useBuscarLotePorPosicion()

  useEffect(() => { posRef.current?.focus() }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { limpiarTodo(); posRef.current?.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function limpiarTodo() {
    setCodPosicion(''); setCodProducto('')
    setPosInfo(null); setError(null)
  }

  async function confirmarPosicion(codigo?: string) {
    const cod = (codigo ?? codPosicion).trim()
    if (!cod) return
    setError(null); setCargando(true)
    try {
      const pos = await resolverPos.mutateAsync(cod)
      setPosInfo({ id: pos.id, codigo: pos.codigo, detalle: `Rack ${pos.rackCodigo} · Nivel ${pos.nivel} · Pos ${pos.posicion}` })
      setCodPosicion(pos.codigo)
      setTimeout(() => prodRef.current?.focus(), 50)
    } catch (e) {
      beepError()
      setError(e instanceof ApiResponseError ? e.message : 'Posición no encontrada')
      setCodPosicion('')
      posRef.current?.focus()
    } finally { setCargando(false) }
  }

  async function confirmarProducto(codigo?: string) {
    const cod = (codigo ?? codProducto).trim()
    if (!cod || !posInfo) return
    setError(null); setCargando(true)
    try {
      const prod = await resolverProd.mutateAsync(cod)
      const resultado = await registrar.mutateAsync({
        usuarioId,
        posicionId:   posInfo.id,
        productoId:   prod.id,
        cantidad:     0,
        fechaIngreso: new Date().toISOString().slice(0, 10),
      })
      beepOk()
      const ahora = new Date()
      const hora  = ahora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      setRegistros(prev => [{
        id:        resultado.loteId,
        hora,
        ubicacion: posInfo.codigo,
        sku:       resultado.skuProducto,
        nombre:    prod.nombre,
        cantidad:  0,
        ok:        true,
      }, ...prev].slice(0, 50))
      setTotalHoy(n => n + 1)

      if (fijarPos) {
        setCodProducto('')
        setTimeout(() => prodRef.current?.focus(), 50)
      } else {
        limpiarTodo()
        setTimeout(() => posRef.current?.focus(), 50)
      }
    } catch (e) {
      beepError()
      const msg = e instanceof ApiResponseError ? e.message : 'Error al registrar'
      setRegistros(prev => [{
        id:        `err-${Date.now()}`,
        hora:      new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        ubicacion: posInfo.codigo,
        sku:       codProducto,
        nombre:    '—',
        cantidad:  0,
        ok:        false,
      }, ...prev].slice(0, 50))
      setError(msg)
      setCodProducto('')
      setTimeout(() => prodRef.current?.focus(), 50)
    } finally { setCargando(false) }
  }

  const posValida    = !!posInfo
  const prodValido   = codProducto.trim().length > 0
  const puedeEnviar  = posValida && prodValido && !cargando

  return (
    <div className="inv2-layout">
      {/* ── Panel izquierdo: captura ── */}
      <div className="inv2-panel-izq">
        <div className="inv2-panel-titulo">Captura rápida</div>

        {error && <div className="inv2-error">{error}</div>}

        {/* Campo Ubicación */}
        <div className="inv2-campo-grupo">
          <label className="inv2-label">
            <span className="inv2-label-ico inv2-label-ico--cyan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/>
                <rect x="3" y="16" width="5" height="5" rx="1"/><path d="M16 16h5v5"/><path d="M16 19h2"/><path d="M19 16v2"/>
                <path d="M8 8h8v8"/><path d="M8 12h4"/>
              </svg>
            </span>
            Ubicación / Rack
          </label>
          <div className="inv2-input-row">
            <input
              ref={posRef}
              className={`inv2-input ${posInfo ? 'inv2-input--ok' : ''}`}
              type="text"
              placeholder="Escanea el QR del rack…"
              value={codPosicion}
              onChange={e => { setCodPosicion(e.target.value); if (!e.target.value) { setPosInfo(null) }; setError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (posInfo) { prodRef.current?.focus() } else { confirmarPosicion() } } }}
              autoComplete="off"
              disabled={cargando}
            />
            {posInfo
              ? <span className="inv2-field-check">✓</span>
              : <BarcodeScanner title="Escanear QR de ubicación" onDetected={cod => { setCodPosicion(cod); setError(null); confirmarPosicion(cod) }} />
            }
          </div>
          {posInfo && (
            <div className="inv2-pos-badge">
              <span className="inv2-pos-codigo">{posInfo.codigo}</span>
              <span className="inv2-pos-detalle">{posInfo.detalle}</span>
            </div>
          )}

          {/* Toggle fijar posición */}
          <label className="inv2-toggle-label">
            <div
              className={`inv2-toggle ${fijarPos ? 'inv2-toggle--on' : ''}`}
              onClick={() => setFijarPos(v => !v)}
              role="switch"
              aria-checked={fijarPos}
            >
              <div className="inv2-toggle-thumb" />
            </div>
            <span>Fijar posición (no limpiar al confirmar)</span>
          </label>
        </div>

        {/* Campo Producto */}
        <div className="inv2-campo-grupo">
          <label className="inv2-label">
            <span className="inv2-label-ico inv2-label-ico--amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <path d="M3 5h2"/><path d="M7 5h2"/><path d="M3 9h2"/><path d="M7 9h2"/>
                <path d="M11 5v4"/><rect x="13" y="4" width="8" height="6" rx="1"/>
                <path d="M3 14h18"/><path d="M3 18h18"/>
              </svg>
            </span>
            Código SKU / Barcode
          </label>
          <div className="inv2-input-row">
            <input
              ref={prodRef}
              className="inv2-input"
              type="text"
              placeholder={posInfo ? 'Escanea el código de barras…' : 'Primero confirma la ubicación'}
              value={codProducto}
              onChange={e => { setCodProducto(e.target.value); setError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmarProducto() } }}
              autoComplete="off"
              disabled={!posInfo || cargando}
            />
          </div>
          {posInfo && (
            <div className="inv2-camara-row">
              <BarcodeScanner title="Escanear código de producto con cámara" onDetected={cod => { setCodProducto(cod); setError(null); confirmarProducto(cod) }} />
              <span className="inv2-camara-label">Escanear con cámara</span>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="inv2-acciones">
          <button
            className="inv2-btn-primario"
            disabled={!puedeEnviar}
            onClick={() => confirmarProducto()}
          >
            {cargando ? 'Procesando…' : 'Confirmar ingreso'}
            {!cargando && <span className="inv2-atajo">Enter ↵</span>}
          </button>
          <button
            className="inv2-btn-secundario"
            onClick={() => { limpiarTodo(); posRef.current?.focus() }}
          >
            Limpiar campos <span className="inv2-atajo">Esc</span>
          </button>
        </div>

        {/* Modificar posición ocupada */}
        <details className="inv2-modificar-details">
          <summary>✎ Modificar posición ocupada</summary>
          <ModificarPosicion
            buscarLote={buscarLote}
            eliminar={eliminar}
            onDone={() => { limpiarTodo(); posRef.current?.focus() }}
          />
        </details>
      </div>

      {/* ── Panel derecho: historial ── */}
      <div className="inv2-panel-der">
        <div className="inv2-panel-titulo">Historial de sesión</div>
        {registros.length === 0 ? (
          <div className="inv2-hist-vacio">Los registros aparecerán aquí al confirmar</div>
        ) : (
          <div className="inv2-hist-scroll">
            <table className="inv2-hist-tabla">
              <thead>
                <tr>
                  <th className="inv2-hist-th">Hora</th>
                  <th className="inv2-hist-th">Ubicación</th>
                  <th className="inv2-hist-th">SKU</th>
                  <th className="inv2-hist-th">Estado</th>
                </tr>
              </thead>
              <tbody>
                {registros.map(r => (
                  <tr key={r.id} className={`inv2-hist-fila ${r.ok ? '' : 'inv2-hist-fila--err'}`}>
                    <td className="inv2-hist-td inv2-hist-hora">{r.hora}</td>
                    <td className="inv2-hist-td"><code className="inv2-hist-ubi">{r.ubicacion}</code></td>
                    <td className="inv2-hist-td">
                      <span className="inv2-hist-sku">{r.sku}</span>
                      <span className="inv2-hist-nombre">{r.nombre}</span>
                    </td>
                    <td className="inv2-hist-td inv2-hist-estado">
                      {r.ok
                        ? <span className="inv2-ok-chip">✓</span>
                        : <span className="inv2-err-chip">✗</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="inv2-total-bar">
          <span className="inv2-total-label">Total asignados hoy</span>
          <span className="inv2-total-num">{totalHoy} SKU{totalHoy !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}

function ModificarPosicion({
  buscarLote, eliminar, onDone,
}: {
  buscarLote: ReturnType<typeof useBuscarLotePorPosicion>
  eliminar:   ReturnType<typeof useEliminarLoteInicial>
  onDone:     () => void
}) {
  const [cod,   setCod]   = useState('')
  const [lote,  setLote]  = useState<{ loteId: string; skuProducto: string; nombreProducto: string; posicionCodigo: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function buscar() {
    if (!cod.trim()) return
    setError(null); setLote(null)
    try { setLote(await buscarLote.mutateAsync(cod.trim())) }
    catch (e) { setError(e instanceof Error ? e.message : 'No encontrado') }
  }

  async function quitar() {
    if (!lote) return
    setError(null)
    try { await eliminar.mutateAsync(lote.loteId); setCod(''); setLote(null); onDone() }
    catch (e) { setError(e instanceof Error ? e.message : 'Error al eliminar') }
  }

  return (
    <div className="inv2-modificar-body">
      {error && <div className="inv2-error" style={{ marginBottom: '0.5rem' }}>{error}</div>}
      <div className="inv2-input-row">
        <input
          className="inv2-input"
          type="text"
          placeholder="Código de posición…"
          value={cod}
          onChange={e => { setCod(e.target.value); setLote(null); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && buscar()}
          autoComplete="off"
        />
        <button className="inv2-btn-sm" onClick={buscar} disabled={buscarLote.isPending || !cod.trim()}>
          {buscarLote.isPending ? '…' : 'Buscar'}
        </button>
      </div>
      {lote && (
        <div className="inv2-lote-encontrado">
          <span className="inv2-hist-ubi">{lote.posicionCodigo}</span>
          <span className="inv2-hist-sku">{lote.skuProducto}</span>
          <span className="inv2-hist-nombre">{lote.nombreProducto}</span>
          <button className="inv2-btn-danger" onClick={quitar} disabled={eliminar.isPending}>
            {eliminar.isPending ? 'Eliminando…' : 'Quitar producto'}
          </button>
        </div>
      )}
    </div>
  )
}
