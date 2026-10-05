import { useState, useRef, useEffect } from 'react'
import { useIniciarReubicacion, useConfirmarReubicacion } from '../hooks/useTraslados'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import { BarcodeScanner } from '../../../shared/components/BarcodeScanner'
import type { IniciarReubicacionResult } from '../services/traslados.api'

type Paso =
  | { tipo: 'escanear_origen' }
  | { tipo: 'escanear_producto'; origenCodigo: string }
  | { tipo: 'seleccionar_destino'; info: IniciarReubicacionResult }
  | { tipo: 'escanear_destino'; info: IniciarReubicacionResult; posicionDestinoId: string; posicionDestinoCodigo: string }
  | { tipo: 'resultado'; posicionOrigen: string; posicionDestino: string }

interface Props {
  offline:  boolean
  onCerrar: () => void
}

export function ReubicacionFlow({ offline, onCerrar }: Props) {
  const [paso, setPaso]     = useState<Paso>({ tipo: 'escanear_origen' })
  const [error, setError]   = useState<string | null>(null)
  const origenRef   = useRef<HTMLInputElement>(null)
  const productoRef = useRef<HTMLInputElement>(null)
  const destinoRef  = useRef<HTMLInputElement>(null)

  const iniciar    = useIniciarReubicacion()
  const confirmar  = useConfirmarReubicacion()

  const USUARIO_ID = localStorage.getItem('user_id') ?? ''

  useEffect(() => {
    if (paso.tipo === 'escanear_origen')   origenRef.current?.focus()
    if (paso.tipo === 'escanear_producto') productoRef.current?.focus()
    if (paso.tipo === 'escanear_destino')  destinoRef.current?.focus()
  }, [paso])

  async function handleEscanearOrigen(codigo: string) {
    if (!codigo.trim()) return
    setPaso({ tipo: 'escanear_producto', origenCodigo: codigo.trim() })
    setError(null)
  }

  async function handleEscanearProducto(codigo: string) {
    if (!codigo.trim() || paso.tipo !== 'escanear_producto') return
    setError(null)
    try {
      const info = await iniciar.mutateAsync({
        usuarioId:            USUARIO_ID,
        posicionOrigenCodigo: paso.origenCodigo,
        productoCodigo:       codigo.trim(),
      })
      setPaso({ tipo: 'seleccionar_destino', info })
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al iniciar reubicación')
    }
  }

  function handleSeleccionarDestino(posicionId: string, posicionCodigo: string) {
    if (paso.tipo !== 'seleccionar_destino') return
    setPaso({ tipo: 'escanear_destino', info: paso.info, posicionDestinoId: posicionId, posicionDestinoCodigo: posicionCodigo })
    setError(null)
  }

  async function handleEscanearDestino(codigoEscaneado: string) {
    if (!codigoEscaneado.trim() || paso.tipo !== 'escanear_destino') return
    setError(null)

    // Regla 5: validación doble — el código escaneado debe coincidir con el seleccionado
    if (codigoEscaneado.trim() !== paso.posicionDestinoCodigo) {
      setError(`Rack incorrecto. El destino seleccionado es ${paso.posicionDestinoCodigo}`)
      return
    }

    try {
      const resultado = await confirmar.mutateAsync({
        usuarioId:             USUARIO_ID,
        loteId:                paso.info.loteId,
        posicionDestinoCodigo: paso.posicionDestinoCodigo,
        posicionDestinoId:     paso.posicionDestinoId,
      })
      setPaso({ tipo: 'resultado', posicionOrigen: resultado.posicionOrigen, posicionDestino: resultado.posicionDestino })
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al confirmar reubicación')
    }
  }

  return (
    <div className="traslado-flow">
      <div className="traslado-header">
        <button className="btn-volver" onClick={onCerrar}>← Volver</button>
        <h3>Re-ubicar producto</h3>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* PASO 1: Escanear rack origen */}
      {paso.tipo === 'escanear_origen' && (
        <div className="paso">
          <p>Escanea el rack donde está el producto</p>
          <div className="barra-busqueda">
            <input
              ref={origenRef}
              type="text"
              placeholder="Código rack origen…"
              autoComplete="off"
              disabled={offline}
              onKeyDown={(e) => e.key === 'Enter' && handleEscanearOrigen(e.currentTarget.value)}
            />
            <BarcodeScanner title="Escanear rack origen" onDetected={(c) => handleEscanearOrigen(c)} />
          </div>
          <button className="btn-primario" disabled={offline} onClick={() => handleEscanearOrigen(origenRef.current?.value ?? '')}>
            Confirmar
          </button>
        </div>
      )}

      {/* PASO 2: Escanear producto */}
      {paso.tipo === 'escanear_producto' && (
        <div className="paso">
          <p>Rack origen: <strong>{paso.origenCodigo}</strong></p>
          <p>Escanea el código de barras del producto</p>
          <div className="barra-busqueda">
            <input
              ref={productoRef}
              type="text"
              placeholder="Código producto…"
              autoComplete="off"
              disabled={iniciar.isPending}
              onKeyDown={(e) => e.key === 'Enter' && handleEscanearProducto(e.currentTarget.value)}
            />
            <BarcodeScanner title="Escanear producto" onDetected={(c) => handleEscanearProducto(c)} />
          </div>
          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => { setPaso({ tipo: 'escanear_origen' }); setError(null) }}>← Volver</button>
            <button className="btn-primario" disabled={iniciar.isPending} onClick={() => handleEscanearProducto(productoRef.current?.value ?? '')}>
              {iniciar.isPending ? 'Verificando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {/* PASO 3: Seleccionar destino */}
      {paso.tipo === 'seleccionar_destino' && (
        <div className="paso">
          <div className="info-producto">
            <p><strong>{paso.info.sku}</strong> — {paso.info.nombre}</p>
            <p>Cantidad: {paso.info.cantidad} · Origen: {paso.info.posicionOrigen}</p>
          </div>
          <p>Selecciona el rack destino:</p>
          <div className="posiciones-lista">
            {paso.info.posicionesDisponibles.length === 0
              ? <p className="vacio">No hay posiciones disponibles</p>
              : paso.info.posicionesDisponibles.map((pos) => (
                <button
                  key={pos.posicionId}
                  className="posicion-opcion"
                  onClick={() => handleSeleccionarDestino(pos.posicionId, pos.codigo)}
                >
                  {pos.codigo}
                </button>
              ))
            }
          </div>
          <button className="btn-secundario" onClick={() => { setPaso({ tipo: 'escanear_origen' }); setError(null) }}>← Volver</button>
        </div>
      )}

      {/* PASO 4: Escanear destino para confirmar (validación doble) */}
      {paso.tipo === 'escanear_destino' && (
        <div className="paso">
          <div className="info-producto">
            <p><strong>{paso.info.sku}</strong></p>
            <p>Origen: {paso.info.posicionOrigen} → Destino seleccionado: <strong>{paso.posicionDestinoCodigo}</strong></p>
          </div>
          <p>Escanea el rack destino para confirmar</p>
          <div className="barra-busqueda">
            <input
              ref={destinoRef}
              type="text"
              placeholder={`Esperado: ${paso.posicionDestinoCodigo}`}
              autoComplete="off"
              disabled={confirmar.isPending}
              onKeyDown={(e) => e.key === 'Enter' && handleEscanearDestino(e.currentTarget.value)}
            />
            <BarcodeScanner title="Escanear rack destino" onDetected={(c) => handleEscanearDestino(c)} />
          </div>
          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => { setPaso({ tipo: 'seleccionar_destino', info: paso.info }); setError(null) }}>← Volver</button>
            <button className="btn-primario" disabled={confirmar.isPending} onClick={() => handleEscanearDestino(destinoRef.current?.value ?? '')}>
              {confirmar.isPending ? 'Confirmando…' : 'Confirmar traslado'}
            </button>
          </div>
        </div>
      )}

      {/* RESULTADO */}
      {paso.tipo === 'resultado' && (
        <div className="paso resultado">
          <div className="resultado-ok">
            <span className="icono-ok">✓</span>
            <p>Producto re-ubicado correctamente</p>
            <p>{paso.posicionOrigen} → <strong>{paso.posicionDestino}</strong></p>
          </div>
          <button className="btn-primario" onClick={onCerrar}>Volver</button>
        </div>
      )}
    </div>
  )
}
