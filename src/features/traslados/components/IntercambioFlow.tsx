import { useState, useRef, useEffect } from 'react'
import { useIniciarIntercambio, useSeleccionarDestino, useConfirmarIntercambio } from '../hooks/useTraslados'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import { BarcodeScanner } from '../../../shared/components/BarcodeScanner'
import type { IniciarIntercambioResult, SeleccionarDestinoResult } from '../services/traslados.api'

type Paso =
  | { tipo: 'escanear_origen' }
  | { tipo: 'escanear_producto_origen'; origenCodigo: string }
  | { tipo: 'escanear_destino'; infoOrigen: IniciarIntercambioResult }
  | { tipo: 'escanear_producto_destino'; infoOrigen: IniciarIntercambioResult; destinoCodigo: string }
  | { tipo: 'confirmar'; infoIntercambio: SeleccionarDestinoResult }
  | { tipo: 'escanear_confirmacion_origen'; infoIntercambio: SeleccionarDestinoResult; origenConfirmado: boolean }
  | { tipo: 'resultado'; posicionOrigen: string; posicionDestino: string }

interface Props {
  offline:  boolean
  onCerrar: () => void
}

export function IntercambioFlow({ offline, onCerrar }: Props) {
  const [paso, setPaso]   = useState<Paso>({ tipo: 'escanear_origen' })
  const [error, setError] = useState<string | null>(null)
  const [codigoOrigenConfirm, setCodigoOrigenConfirm]   = useState('')
  const [codigoDestinoConfirm, setCodigoDestinoConfirm] = useState('')

  const ref1 = useRef<HTMLInputElement>(null)
  const ref2 = useRef<HTMLInputElement>(null)
  const ref3 = useRef<HTMLInputElement>(null)
  const ref4 = useRef<HTMLInputElement>(null)

  const iniciar    = useIniciarIntercambio()
  const seleccionar = useSeleccionarDestino()
  const confirmar  = useConfirmarIntercambio()

  const USUARIO_ID = localStorage.getItem('user_id') ?? ''

  useEffect(() => {
    const map: Partial<Record<Paso['tipo'], React.RefObject<HTMLInputElement | null>>> = {
      escanear_origen:           ref1,
      escanear_producto_origen:  ref2,
      escanear_destino:          ref3,
      escanear_producto_destino: ref4,
    }
    map[paso.tipo]?.current?.focus()
  }, [paso])

  async function handleEscanearOrigen(codigo: string) {
    if (!codigo.trim()) return
    setPaso({ tipo: 'escanear_producto_origen', origenCodigo: codigo.trim() })
    setError(null)
  }

  async function handleEscanearProductoOrigen(codigo: string) {
    if (!codigo.trim() || paso.tipo !== 'escanear_producto_origen') return
    setError(null)
    try {
      const info = await iniciar.mutateAsync({
        usuarioId:            USUARIO_ID,
        posicionOrigenCodigo: paso.origenCodigo,
        productoOrigenCodigo: codigo.trim(),
      })
      setPaso({ tipo: 'escanear_destino', infoOrigen: info })
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al iniciar intercambio')
    }
  }

  async function handleEscanearDestino(codigo: string) {
    if (!codigo.trim() || paso.tipo !== 'escanear_destino') return
    setPaso({ tipo: 'escanear_producto_destino', infoOrigen: paso.infoOrigen, destinoCodigo: codigo.trim() })
    setError(null)
  }

  async function handleEscanearProductoDestino(codigo: string) {
    if (!codigo.trim() || paso.tipo !== 'escanear_producto_destino') return
    setError(null)
    try {
      const info = await seleccionar.mutateAsync({
        usuarioId:             USUARIO_ID,
        loteOrigenId:          paso.infoOrigen.loteOrigenId,
        posicionDestinoCodigo: paso.destinoCodigo,
        productoDestinoCodigo: codigo.trim(),
      })
      setPaso({ tipo: 'confirmar', infoIntercambio: info })
      setCodigoOrigenConfirm('')
      setCodigoDestinoConfirm('')
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al seleccionar destino')
    }
  }

  async function handleConfirmar() {
    if (paso.tipo !== 'confirmar') return
    setError(null)

    // Regla 5: validación doble — ambos racks deben coincidir
    if (codigoOrigenConfirm.trim() !== paso.infoIntercambio.posicionOrigen) {
      setError(`Rack origen incorrecto. Esperado: ${paso.infoIntercambio.posicionOrigen}`)
      return
    }
    if (codigoDestinoConfirm.trim() !== paso.infoIntercambio.posicionDestino) {
      setError(`Rack destino incorrecto. Esperado: ${paso.infoIntercambio.posicionDestino}`)
      return
    }

    try {
      const resultado = await confirmar.mutateAsync({
        usuarioId:              USUARIO_ID,
        loteOrigenId:           paso.infoIntercambio.loteOrigenId,
        loteDestinoId:          paso.infoIntercambio.loteDestinoId,
        codigoRackOrigenFinal:  codigoOrigenConfirm.trim(),
        codigoRackDestinoFinal: codigoDestinoConfirm.trim(),
      })
      setPaso({ tipo: 'resultado', posicionOrigen: resultado.posicionOrigen, posicionDestino: resultado.posicionDestino })
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al confirmar intercambio')
    }
  }

  return (
    <div className="traslado-flow">
      <div className="traslado-header">
        <button className="btn-volver" onClick={onCerrar}>← Volver</button>
        <h3>Intercambiar productos</h3>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* PASO 1: Escanear rack origen */}
      {paso.tipo === 'escanear_origen' && (
        <div className="paso">
          <p>Escanea el rack del primer producto (origen)</p>
          <div className="barra-busqueda">
            <input
              ref={ref1}
              type="text"
              placeholder="Código rack origen…"
              autoComplete="off"
              disabled={offline}
              onKeyDown={(e) => e.key === 'Enter' && handleEscanearOrigen(e.currentTarget.value)}
            />
            <BarcodeScanner title="Escanear rack origen" onDetected={(c) => handleEscanearOrigen(c)} />
          </div>
          <button className="btn-primario" disabled={offline} onClick={() => handleEscanearOrigen(ref1.current?.value ?? '')}>
            Confirmar
          </button>
        </div>
      )}

      {/* PASO 2: Escanear producto origen */}
      {paso.tipo === 'escanear_producto_origen' && (
        <div className="paso">
          <p>Rack origen: <strong>{paso.origenCodigo}</strong></p>
          <p>Escanea el producto en este rack</p>
          <div className="barra-busqueda">
            <input
              ref={ref2}
              type="text"
              placeholder="Código producto origen…"
              autoComplete="off"
              disabled={iniciar.isPending}
              onKeyDown={(e) => e.key === 'Enter' && handleEscanearProductoOrigen(e.currentTarget.value)}
            />
            <BarcodeScanner title="Escanear producto origen" onDetected={(c) => handleEscanearProductoOrigen(c)} />
          </div>
          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => { setPaso({ tipo: 'escanear_origen' }); setError(null) }}>← Volver</button>
            <button className="btn-primario" disabled={iniciar.isPending} onClick={() => handleEscanearProductoOrigen(ref2.current?.value ?? '')}>
              {iniciar.isPending ? 'Verificando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {/* PASO 3: Escanear rack destino */}
      {paso.tipo === 'escanear_destino' && (
        <div className="paso">
          <p>Origen confirmado: <strong>{paso.infoOrigen.productoOrigen}</strong> en <strong>{paso.infoOrigen.posicionOrigen}</strong></p>
          <p>Escanea el rack del segundo producto (destino)</p>
          <div className="barra-busqueda">
            <input
              ref={ref3}
              type="text"
              placeholder="Código rack destino…"
              autoComplete="off"
              onKeyDown={(e) => e.key === 'Enter' && handleEscanearDestino(e.currentTarget.value)}
            />
            <BarcodeScanner title="Escanear rack destino" onDetected={(c) => handleEscanearDestino(c)} />
          </div>
          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => { setPaso({ tipo: 'escanear_origen' }); setError(null) }}>← Volver</button>
            <button className="btn-primario" onClick={() => handleEscanearDestino(ref3.current?.value ?? '')}>
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* PASO 4: Escanear producto destino */}
      {paso.tipo === 'escanear_producto_destino' && (
        <div className="paso">
          <p>Rack destino: <strong>{paso.destinoCodigo}</strong></p>
          <p>Escanea el producto en este rack</p>
          <div className="barra-busqueda">
            <input
              ref={ref4}
              type="text"
              placeholder="Código producto destino…"
              autoComplete="off"
              disabled={seleccionar.isPending}
              onKeyDown={(e) => e.key === 'Enter' && handleEscanearProductoDestino(e.currentTarget.value)}
            />
            <BarcodeScanner title="Escanear producto destino" onDetected={(c) => handleEscanearProductoDestino(c)} />
          </div>
          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => { setPaso({ tipo: 'escanear_destino', infoOrigen: paso.infoOrigen }); setError(null) }}>← Volver</button>
            <button className="btn-primario" disabled={seleccionar.isPending} onClick={() => handleEscanearProductoDestino(ref4.current?.value ?? '')}>
              {seleccionar.isPending ? 'Verificando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {/* PASO 5: Confirmación con doble escaneo (Regla 5) */}
      {paso.tipo === 'confirmar' && (
        <div className="paso">
          <div className="resumen-intercambio">
            <div className="intercambio-item">
              <span className="label">Origen</span>
              <strong>{paso.infoIntercambio.productoOrigen}</strong>
              <span>{paso.infoIntercambio.posicionOrigen}</span>
            </div>
            <div className="intercambio-flecha">⇄</div>
            <div className="intercambio-item">
              <span className="label">Destino</span>
              <strong>{paso.infoIntercambio.productoDestino}</strong>
              <span>{paso.infoIntercambio.posicionDestino}</span>
            </div>
          </div>
          <p>Confirma escaneando ambos racks:</p>
          <label>
            Rack origen (<code>{paso.infoIntercambio.posicionOrigen}</code>)
            <div className="barra-busqueda">
              <input
                type="text"
                value={codigoOrigenConfirm}
                onChange={(e) => setCodigoOrigenConfirm(e.target.value)}
                placeholder={`Escanear ${paso.infoIntercambio.posicionOrigen}`}
                autoFocus
              />
              <BarcodeScanner title="Escanear rack origen" onDetected={(c) => setCodigoOrigenConfirm(c)} />
            </div>
          </label>
          <label>
            Rack destino (<code>{paso.infoIntercambio.posicionDestino}</code>)
            <div className="barra-busqueda">
              <input
                type="text"
                value={codigoDestinoConfirm}
                onChange={(e) => setCodigoDestinoConfirm(e.target.value)}
                placeholder={`Escanear ${paso.infoIntercambio.posicionDestino}`}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmar()}
              />
              <BarcodeScanner title="Escanear rack destino" onDetected={(c) => setCodigoDestinoConfirm(c)} />
            </div>
          </label>
          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => { setPaso({ tipo: 'escanear_origen' }); setError(null) }}>← Cancelar</button>
            <button
              className="btn-primario"
              disabled={confirmar.isPending || !codigoOrigenConfirm.trim() || !codigoDestinoConfirm.trim()}
              onClick={handleConfirmar}
            >
              {confirmar.isPending ? 'Confirmando…' : 'Confirmar intercambio'}
            </button>
          </div>
        </div>
      )}

      {/* RESULTADO */}
      {paso.tipo === 'resultado' && (
        <div className="paso resultado">
          <div className="resultado-ok">
            <span className="icono-ok">✓</span>
            <p>Cambio exitoso</p>
            <p>{paso.posicionOrigen} ⇄ <strong>{paso.posicionDestino}</strong></p>
          </div>
          <button className="btn-primario" onClick={onCerrar}>Volver</button>
        </div>
      )}
    </div>
  )
}
