import { useState, useRef, useEffect } from 'react'
import { BarcodeScanner } from '../../../shared/components/BarcodeScanner'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import { sonarEscaneoExitoso, sonarEscaneoError } from '../../../shared/utils/sonidos'
import { onlyNumbersKeyDown, onlyNumbersPaste } from '../../../shared/utils/numericInput'
import { useRegistrarPickingPM, useSinStockPM } from '../hooks/usePickingMasivo'
import type { LineaOrden, UbicacionPM } from '../services/pickingMasivo.api'

interface Props {
  linea:      LineaOrden
  usuarioId:  string
  onSalir:    () => void
  onTerminada: (ordenCompleta: boolean) => void
}

type Parada = UbicacionPM & { cantidadATomar: number }

type Paso =
  | { tipo: 'rack';     idx: number }
  | { tipo: 'producto'; idx: number }
  | { tipo: 'cantidad'; idx: number; codigoProducto: string }
  | { tipo: 'motivo';   idx: number; codigoProducto: string; cantidad: number }
  | { tipo: 'sin_stock' }

const normBarra = (s: string | null | undefined) => (s ?? '').trim().replace(/^0+/, '')

function calcularPlan(ubicaciones: UbicacionPM[], necesario: number): Parada[] {
  const plan: Parada[] = []
  let restante = necesario
  for (const u of ubicaciones) {
    if (restante <= 0) break
    const tomar = Math.min(u.cantidad, restante)
    plan.push({ ...u, cantidadATomar: tomar })
    restante -= tomar
  }
  return plan
}

export function PickingLineaFlow({ linea, usuarioId, onSalir, onTerminada }: Props) {
  const pendiente = linea.cantidadPedida - linea.cantidadDespachada
  const [plan]               = useState<Parada[]>(() => calcularPlan(linea.ubicaciones, pendiente))
  const [paso, setPaso]      = useState<Paso>(() => (plan.length ? { tipo: 'rack', idx: 0 } : { tipo: 'sin_stock' }))
  const [tomado, setTomado]  = useState(0)
  const [cantidad, setCantidad] = useState(() => plan[0]?.cantidadATomar.toString() ?? '')
  const [motivo, setMotivo]  = useState('')
  const [error, setError]    = useState<string | null>(null)
  const rackValidado = useRef<string | null>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  const registrar = useRegistrarPickingPM()
  const sinStock  = useSinStockPM()
  const parada    = 'idx' in paso ? plan[paso.idx] : null
  const esUltima  = 'idx' in paso && paso.idx === plan.length - 1

  useEffect(() => {
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.focus() }
  }, [paso])

  function irAParada(idx: number) {
    rackValidado.current = null
    setCantidad(plan[idx]?.cantidadATomar.toString() ?? '')
    setPaso({ tipo: 'rack', idx })
    setError(null)
  }

  function escanearRack(codigo: string) {
    if (paso.tipo !== 'rack' || !parada || !codigo.trim()) return
    if (codigo.trim().toUpperCase() !== parada.posicionCodigo.toUpperCase()) {
      sonarEscaneoError()
      setError('Ubicación incorrecta. Por favor, diríjase al rack asignado')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    sonarEscaneoExitoso()
    rackValidado.current = parada.posicionCodigo
    setError(null)
    setPaso({ tipo: 'producto', idx: paso.idx })
  }

  function escanearProducto(codigo: string) {
    if (paso.tipo !== 'producto' || !codigo.trim()) return
    if (!rackValidado.current) { setError('Primero escanea el rack asignado'); return }
    const c = normBarra(codigo)
    if (c !== normBarra(linea.codigoBarra) && c !== normBarra(linea.codigoBarraAlternativo)) {
      sonarEscaneoError()
      setError(`Producto incorrecto. Escanea el producto ${linea.sku}`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    sonarEscaneoExitoso()
    setError(null)
    setPaso({ tipo: 'cantidad', idx: paso.idx, codigoProducto: codigo.trim() })
  }

  async function enviar(idx: number, codigoProducto: string, cant: number, comentario: string | null) {
    const intermedia = idx < plan.length - 1
    try {
      const r = await registrar.mutateAsync({
        usuarioId,
        itemId:             linea.id,
        codigoRack:         rackValidado.current ?? '',
        codigoProducto,
        cantidad:           cant,
        loteId:             plan[idx].loteId,
        esParadaIntermedia: intermedia,
        comentario,
      })
      setTomado((t) => t + cant)
      if (r.lineaResuelta) onTerminada(r.ordenCompleta)
      else irAParada(idx + 1)
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al registrar el picking')
    }
  }

  function confirmarCantidad() {
    if (paso.tipo !== 'cantidad' || !parada) return
    const cant = parseInt(cantidad, 10)
    if (!cant || cant <= 0) { setError('Ingresa una cantidad válida'); return }
    if (cant > parada.cantidad) { setError(`Supera el stock de este rack — disponible: ${parada.cantidad}`); return }
    if (tomado + cant > pendiente) { setError(`No puedes sacar más de lo pedido — pendiente: ${pendiente - tomado}`); return }
    if (esUltima && tomado + cant < pendiente) {
      setMotivo('')
      setPaso({ tipo: 'motivo', idx: paso.idx, codigoProducto: paso.codigoProducto, cantidad: cant })
      return
    }
    void enviar(paso.idx, paso.codigoProducto, cant, null)
  }

  async function confirmarSinStock() {
    if (!motivo.trim()) { setError('Indica el motivo'); return }
    try {
      const r = await sinStock.mutateAsync({ usuarioId, itemId: linea.id, comentario: motivo.trim() })
      onTerminada(r.ordenCompleta)
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al registrar sin stock')
    }
  }

  return (
    <div className="picking-flow">
      <div className="picking-header">
        <div>
          <h3>{linea.sku}</h3>
          <p className="picking-nombre">{linea.nombre}</p>
          {linea.codigoCliente && <p className="picking-nombre">Cód. cliente: {linea.codigoCliente}</p>}
        </div>
        <button className="btn-cerrar" onClick={onSalir} aria-label="Salir">✕</button>
      </div>

      <div className="picking-progreso">
        <span className="pendiente-badge">Pendiente: <strong>{pendiente - tomado}</strong> de {linea.cantidadPedida}</span>
        {plan.length > 1 && 'idx' in paso && <span className="multilote-badge">Parada {paso.idx + 1} de {plan.length}</span>}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {paso.tipo === 'rack' && parada && (
        <div className="paso">
          <div className="ubicacion-fifo fifo-actual">
            <span className="codigo-rack">Dirígete al rack {parada.posicionCodigo}</span>
            <span className="cantidad">Sacar {parada.cantidadATomar} uds</span>
            <span className="fecha">Ingreso {parada.fechaIngreso.slice(0, 10).split('-').reverse().join('-')}</span>
          </div>
          <p className="paso-instruccion">Escanea el código del rack</p>
          <div className="input-con-camara">
            <input ref={inputRef} type="text" placeholder="Código rack…" autoComplete="off"
              onKeyDown={(e) => e.key === 'Enter' && escanearRack(e.currentTarget.value)} />
            <BarcodeScanner title="Escanear rack" onDetected={(c) => { if (inputRef.current) inputRef.current.value = c; escanearRack(c) }} />
          </div>
          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => { setMotivo(''); setPaso({ tipo: 'sin_stock' }); setError(null) }}>Sin stock</button>
            <button className="btn-primario" onClick={() => escanearRack(inputRef.current?.value ?? '')}>Confirmar rack</button>
          </div>
        </div>
      )}

      {paso.tipo === 'producto' && parada && (
        <div className="paso">
          <p>Rack <strong>{parada.posicionCodigo}</strong> validado</p>
          <p className="paso-instruccion">Escanea el código de barras del producto</p>
          <div className="input-con-camara">
            <input ref={inputRef} type="text" inputMode="numeric" placeholder="Código producto…" autoComplete="off"
              onKeyDown={(e) => e.key === 'Enter' && escanearProducto(e.currentTarget.value)} />
            <BarcodeScanner title="Escanear producto" onDetected={(c) => { if (inputRef.current) inputRef.current.value = c; escanearProducto(c) }} />
          </div>
          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => irAParada(paso.idx)}>← Volver</button>
            <button className="btn-primario" onClick={() => escanearProducto(inputRef.current?.value ?? '')}>Confirmar</button>
          </div>
        </div>
      )}

      {paso.tipo === 'cantidad' && parada && (
        <div className="paso">
          <p>Retirar de {parada.posicionCodigo}: <strong>{parada.cantidadATomar}</strong> unidades</p>
          <label>
            Cantidad retirada:
            <input type="number" min={1} max={Math.min(parada.cantidad, pendiente - tomado)} value={cantidad} autoFocus
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => { onlyNumbersKeyDown(e); if (e.key === 'Enter') confirmarCantidad() }}
              onPaste={onlyNumbersPaste} />
          </label>
          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => setPaso({ tipo: 'producto', idx: paso.idx })}>← Volver</button>
            <button className="btn-primario" disabled={registrar.isPending || !cantidad} onClick={confirmarCantidad}>
              {registrar.isPending ? 'Registrando…' : esUltima ? 'Confirmar' : 'Confirmar y continuar →'}
            </button>
          </div>
        </div>
      )}

      {paso.tipo === 'motivo' && (
        <div className="paso">
          <p>Picking parcial: se retirarán {tomado + paso.cantidad} de {pendiente} unidades. Indica el motivo:</p>
          <textarea className="pmo-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: stock insuficiente, producto dañado…" />
          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => setPaso({ tipo: 'cantidad', idx: paso.idx, codigoProducto: paso.codigoProducto })}>← Volver</button>
            <button className="btn-primario" disabled={registrar.isPending || !motivo.trim()}
              onClick={() => void enviar(paso.idx, paso.codigoProducto, paso.cantidad, motivo.trim())}>
              {registrar.isPending ? 'Registrando…' : 'Confirmar parcial'}
            </button>
          </div>
        </div>
      )}

      {paso.tipo === 'sin_stock' && (
        <div className="paso">
          {!plan.length && <p>Este producto no tiene stock en ninguna ubicación.</p>}
          <p>Indica el motivo para marcar la línea sin stock:</p>
          <textarea className="pmo-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: no hay stock en bodega" />
          <div className="paso-acciones">
            {plan.length > 0 && <button className="btn-secundario" onClick={() => irAParada(0)}>← Volver</button>}
            <button className="btn-primario" disabled={sinStock.isPending || !motivo.trim()} onClick={() => void confirmarSinStock()}>
              {sinStock.isPending ? 'Registrando…' : 'Confirmar sin stock'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
