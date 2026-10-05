import { useState, useRef, useEffect } from 'react'
import { useRegistrarPicking } from '../hooks/useNotas'
import { SinStockForm } from './SinStockForm'
import { BarcodeScanner } from '../../../shared/components/BarcodeScanner'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import { onlyNumbersKeyDown, onlyNumbersPaste } from '../../../shared/utils/numericInput'
import { sonarEscaneoExitoso, sonarEscaneoError } from '../../../shared/utils/sonidos'
import type { NotaProductoResumen, ProductoConStock, Ubicacion } from '../services/notas.api'

interface Props {
  item:         NotaProductoResumen
  usuarioId:    string
  onCompletado: () => void
  onCerrar:     () => void
}

interface Parada {
  loteId:             string
  posicionCodigo:     string | null
  fechaIngreso:       string
  cantidadDisponible: number
  cantidadATomar:     number
}

type Paso =
  | { tipo: 'inicio' }
  | { tipo: 'seleccionar_equivalente' }
  | { tipo: 'escanear_rack';     paradaIdx: number; equivalenteId?: string }
  | { tipo: 'escanear_producto'; paradaIdx: number; equivalenteId?: string }
  | { tipo: 'ingresar_cantidad'; paradaIdx: number; codigoProducto: string; equivalenteId?: string }
  | { tipo: 'motivo_saltar';     paradaIdx: number; equivalenteId?: string }
  | { tipo: 'motivo_parcial';    cantidadParada: number; cantidadTotal: number; codigoProducto: string; equivalenteId?: string }
  | { tipo: 'resultado';         mensaje: string; stockRestante: number; notaCompleta: boolean }
  | { tipo: 'sin_stock' }

const MOTIVOS_PRESET = [
  'Sin stock suficiente',
  'Cambio de embalaje / bolsa',
  'Producto pendiente de certificación',
  'Producto dañado',
  'Error en nota de venta',
]

const MOTIVOS_SALTAR = [
  'Sin stock en esta ubicación',
  'Producto dañado en esta ubicación',
  'Ubicación inaccesible',
  'Error de sistema',
]

function formatearFecha(fecha: string): string {
  return fecha.slice(0, 10).split('-').reverse().join('-')
}

// Solo para el resumen informativo — agrupa lotes del mismo rack e igual fecha de ingreso
// en una sola fila con el stock acumulado. El plan de picking real sigue operando lote a lote.
function agruparUbicaciones(ubicaciones: Ubicacion[]): Ubicacion[] {
  const grupos = new Map<string, Ubicacion>()
  for (const u of ubicaciones) {
    const key = `${u.posicionCodigo}__${u.fechaIngreso}`
    const existente = grupos.get(key)
    if (existente) {
      existente.cantidad += u.cantidad
    } else {
      grupos.set(key, { ...u })
    }
  }
  return Array.from(grupos.values())
}

function calcularPlan(ubicaciones: Ubicacion[], cantidadNecesaria: number): Parada[] {
  const plan: Parada[] = []
  let restante = cantidadNecesaria
  for (const u of ubicaciones) {
    if (restante <= 0) break
    const tomar = Math.min(u.cantidad, restante)
    plan.push({
      loteId:             u.loteId,
      posicionCodigo:     u.posicionCodigo,
      fechaIngreso:       u.fechaIngreso,
      cantidadDisponible: u.cantidad,
      cantidadATomar:     tomar,
    })
    restante -= tomar
  }
  return plan
}

function UbicacionFifo({ ubicacion, esActual }: { ubicacion: Ubicacion; esActual: boolean }) {
  return (
    <div className={`ubicacion-fifo ${esActual ? 'fifo-actual' : ''}`}>
      <span className="codigo-rack">{ubicacion.posicionCodigo ?? 'Sin ubicación'}</span>
      <span className="cantidad">{ubicacion.cantidad} uds</span>
      <span className="fecha">{formatearFecha(ubicacion.fechaIngreso)}</span>
      {esActual && <span className="badge-fifo">FIFO ↑</span>}
    </div>
  )
}

function EquivalenteCard({ eq, seleccionado, onSeleccionar }: { eq: ProductoConStock; seleccionado: boolean; onSeleccionar: () => void }) {
  return (
    <button
      className={`equivalente-card ${seleccionado ? 'seleccionado' : ''}`}
      onClick={onSeleccionar}
    >
      <div className="eq-sku">{eq.sku}</div>
      <div className="eq-nombre">{eq.nombre}</div>
      <div className="eq-stock">Stock: {eq.stockDisponible}</div>
    </button>
  )
}

export function PickingFlow({ item, usuarioId, onCompletado, onCerrar }: Props) {
  const [paso, setPaso]                   = useState<Paso>({ tipo: 'escanear_producto', paradaIdx: 0 })
  const [cantidad, setCantidad]           = useState('')
  const [error, setError]                 = useState<string | null>(null)
  const [equivalenteId, setEquivalenteId] = useState<string | null>(null)
  const [motivo, setMotivo]               = useState('')
  const [plan, setPlan]                   = useState<Parada[]>([])
  const [pickedSoFar, setPickedSoFar]     = useState(0)

  const productoInputRef = useRef<HTMLInputElement>(null)
  const rackInputRef     = useRef<HTMLInputElement>(null)
  const scanCooldownRef  = useRef(false)

  const registrarPicking = useRegistrarPicking()

  useEffect(() => {
    if (paso.tipo === 'escanear_producto') productoInputRef.current?.focus()
    if (paso.tipo === 'escanear_rack')     rackInputRef.current?.focus()
  }, [paso])

  const ubicacionesFifo   = equivalenteId
    ? (item.equivalentes.find((e) => e.productoId === equivalenteId)?.ubicaciones ?? [])
    : item.ubicaciones
  const ubicacionesResumen = agruparUbicaciones(ubicacionesFifo)
  const tieneStock        = ubicacionesFifo.length > 0
  const cantidadPendiente = item.cantidadSolicitada - item.cantidadDespachada
  const esMultiLote       = plan.length > 1

  const paradaActual = (
    paso.tipo === 'escanear_rack' ||
    paso.tipo === 'escanear_producto' ||
    paso.tipo === 'ingresar_cantidad'
  ) ? plan[paso.paradaIdx] : null

  function handleSeleccionarEquivalente(id: string | null) {
    setEquivalenteId(id)
    setError(null)
  }

  function handleSaltarParada(motivoSaltar: string) {
    if (paso.tipo !== 'motivo_saltar') return
    const siguienteIdx = paso.paradaIdx + 1
    const esUltima     = paso.paradaIdx === plan.length - 1
    setMotivo('')
    setError(null)
    if (esUltima) {
      // Todas las paradas restantes saltadas — despacho parcial con motivo
      setPaso({
        tipo:           'motivo_parcial',
        cantidadParada: 0,
        cantidadTotal:  pickedSoFar,
        codigoProducto: '',
        equivalenteId:  paso.equivalenteId,
      })
      setMotivo(motivoSaltar)
    } else {
      const siguienteParada = plan[siguienteIdx]
      setCantidad(siguienteParada?.cantidadATomar?.toString() ?? '')
      if (rackInputRef.current) rackInputRef.current.value = ''
      setPaso({ tipo: 'escanear_rack', paradaIdx: siguienteIdx, equivalenteId: paso.equivalenteId })
    }
  }

  function handleIniciarPicking() {
    const planCalculado = calcularPlan(ubicacionesFifo, cantidadPendiente)
    setPlan(planCalculado)
    setPickedSoFar(0)
    setCantidad(planCalculado[0]?.cantidadATomar?.toString() ?? '')
    const primerPaso = planCalculado[0]?.posicionCodigo
      ? { tipo: 'escanear_rack' as const, paradaIdx: 0, equivalenteId: equivalenteId ?? undefined }
      : { tipo: 'escanear_producto' as const, paradaIdx: 0, equivalenteId: equivalenteId ?? undefined }
    setPaso(primerPaso)
    setError(null)
  }

  function handleIniciarConEquivalente(eqId: string) {
    setEquivalenteId(eqId)
    setPlan([])
    setPickedSoFar(0)
    setCantidad(cantidadPendiente.toString())
    setPaso({ tipo: 'escanear_producto', paradaIdx: 0, equivalenteId: eqId })
    setError(null)
  }

  function handleClickEquivalente() {
    if (item.equivalentes.length === 1) {
      handleIniciarConEquivalente(item.equivalentes[0].productoId)
    } else {
      setPaso({ tipo: 'seleccionar_equivalente' })
    }
  }

  function handleEscanearRack(codigo: string) {
    if (!codigo.trim() || codigo.trim().length < 2 || paso.tipo !== 'escanear_rack') return
    if (scanCooldownRef.current) return
    scanCooldownRef.current = true
    setTimeout(() => { scanCooldownRef.current = false }, 500)
    const parada = plan[paso.paradaIdx]
    if (codigo.trim() !== parada?.posicionCodigo) {
      setError(`Rack incorrecto. Se esperaba ${parada?.posicionCodigo ?? ''}`)
      if (rackInputRef.current) rackInputRef.current.value = ''
      rackInputRef.current?.focus()
      return
    }
    setPaso({ tipo: 'escanear_producto', paradaIdx: paso.paradaIdx, equivalenteId: paso.equivalenteId })
    setError(null)
  }

  function handleEscanearProducto(codigo: string) {
    if (!codigo.trim() || codigo.trim().length < 2 || paso.tipo !== 'escanear_producto') return
    if (scanCooldownRef.current) return
    scanCooldownRef.current = true
    setTimeout(() => { scanCooldownRef.current = false }, 500)
    const prodRef = equivalenteId
      ? item.equivalentes.find((e) => e.productoId === equivalenteId)
      : null
    const codigoEsperado    = equivalenteId ? (prodRef?.codigoBarra ?? null) : item.codigoBarra
    const codigoAlternativo = equivalenteId ? (prodRef?.codigoBaRalternativo ?? null) : (item.codigoBaRalternativo ?? null)
    const scanValido = !codigoEsperado
      || codigo.trim() === codigoEsperado
      || (!!codigoAlternativo && codigo.trim() === codigoAlternativo)
    if (!scanValido) {
      sonarEscaneoError()
      setError(`Producto incorrecto. Escanea el producto ${equivalenteId ? 'equivalente' : item.sku}`)
      if (productoInputRef.current) productoInputRef.current.value = ''
      productoInputRef.current?.focus()
      return
    }
    const parada = plan[paso.paradaIdx]
    setCantidad(parada?.cantidadATomar?.toString() ?? '')
    sonarEscaneoExitoso()
    setPaso({ tipo: 'ingresar_cantidad', paradaIdx: paso.paradaIdx, codigoProducto: codigo.trim(), equivalenteId: paso.equivalenteId })
    setError(null)
  }

  async function handleConfirmarPicking() {
    if (paso.tipo !== 'ingresar_cantidad') return
    const cant = parseInt(cantidad, 10)
    if (!cant || cant <= 0) { setError('Ingresa una cantidad válida'); return }

    const parada           = plan[paso.paradaIdx]
    const esUltimaParada   = plan.length === 0 || paso.paradaIdx === plan.length - 1
    const cantidadRestante = cantidadPendiente - pickedSoFar

    if (cant > cantidadRestante) {
      setError(`No puedes despachar más de lo pendiente — pendiente: ${cantidadRestante}`)
      return
    }
    if (parada && cant > parada.cantidadDisponible) {
      setError(`Cantidad supera el stock en este lote — disponible: ${parada.cantidadDisponible}`)
      return
    }

    // Última parada y aún queda pendiente → pedir motivo (stock insuficiente en bodega)
    if (esUltimaParada && (pickedSoFar + cant) < cantidadPendiente) {
      setMotivo('')
      setError(null)
      setPaso({
        tipo:          'motivo_parcial',
        cantidadParada: cant,
        cantidadTotal:  pickedSoFar + cant,
        codigoProducto: paso.codigoProducto,
        equivalenteId:  paso.equivalenteId,
      })
      return
    }

    setError(null)
    // esParadaIntermedia = hay más paradas después de esta
    await _llamarApiPicking({
      cant,
      codigoProducto:   paso.codigoProducto,
      eqId:             paso.equivalenteId,
      comentario:       null,
      loteId:           parada?.loteId,
      esParadaIntermedia: !esUltimaParada,
      paradaIdx:        paso.paradaIdx,
    })
  }

  async function handleConfirmarConMotivo() {
    if (paso.tipo !== 'motivo_parcial') return
    if (!motivo.trim()) { setError('Debes indicar el motivo del despacho parcial'); return }
    setError(null)

    // cantidadParada = 0 significa que la última parada fue saltada completamente.
    // El despacho parcial ya quedó en DB por las paradas anteriores → ir directo a resultado.
    if (paso.cantidadParada === 0) {
      setPaso({
        tipo:          'resultado',
        mensaje:       `Despacho parcial — ${pickedSoFar} de ${cantidadPendiente} uds despachadas`,
        stockRestante: 0,
        notaCompleta:  false,
      })
      return
    }

    const ultimaParada = plan[plan.length - 1]
    await _llamarApiPicking({
      cant:             paso.cantidadParada,
      codigoProducto:   paso.codigoProducto,
      eqId:             paso.equivalenteId,
      comentario:       motivo.trim(),
      loteId:           ultimaParada?.loteId,
      esParadaIntermedia: false,
      paradaIdx:        plan.length - 1,
    })
  }

  async function _llamarApiPicking({
    cant, codigoProducto, eqId, comentario, loteId, esParadaIntermedia, paradaIdx,
  }: {
    cant: number; codigoProducto: string; eqId?: string; comentario: string | null
    loteId?: string; esParadaIntermedia: boolean; paradaIdx: number
  }) {
    try {
      const resultado = await registrarPicking.mutateAsync({
        usuarioId,
        notaProductoId:        item.notaProductoId,
        codigoProducto,
        cantidad:              cant,
        usarEquivalente:       !!eqId,
        productoEquivalenteId: eqId,
        comentarioOperador:    comentario ?? undefined,
        loteId,
        esParadaMultiLote:     esParadaIntermedia,
      })

      if (esParadaIntermedia) {
        const nuevoPicked    = pickedSoFar + cant
        const siguienteIdx   = paradaIdx + 1
        const siguienteParada = plan[siguienteIdx]
        setPickedSoFar(nuevoPicked)
        setCantidad(siguienteParada?.cantidadATomar?.toString() ?? '')
        if (rackInputRef.current) rackInputRef.current.value = ''
        const siguientePaso = siguienteParada?.posicionCodigo
          ? { tipo: 'escanear_rack' as const, paradaIdx: siguienteIdx, equivalenteId: eqId ?? undefined }
          : { tipo: 'escanear_producto' as const, paradaIdx: siguienteIdx, equivalenteId: eqId ?? undefined }
        setPaso(siguientePaso)
        return
      }

      setPaso({
        tipo:          'resultado',
        mensaje:       resultado.mensaje,
        stockRestante: resultado.stockRestante,
        notaCompleta:  resultado.notaCompleta,
      })

      if (resultado.notaCompleta) onCompletado()
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al registrar picking')
    }
  }

  return (
    <div className="picking-flow">
      <div className="picking-header">
        <div>
          <h3>{item.sku}</h3>
          <p className="picking-nombre">{item.nombre}</p>
        </div>
        <button className="btn-cerrar" onClick={onCerrar}>✕</button>
      </div>

      {paso.tipo === 'ingresar_cantidad' && (
        <div className="picking-progreso">
          <span className="pendiente-badge">Solicitado: <strong>{cantidadPendiente - pickedSoFar}</strong></span>
        </div>
      )}

      {/* Indicador de parada multi-lote */}
      {esMultiLote && paso.tipo !== 'inicio' && paso.tipo !== 'resultado' && paso.tipo !== 'sin_stock' && (
        <div className="multilote-badge">
          {paso.tipo === 'motivo_parcial'
            ? `${plan.length} rack${plan.length > 1 ? 's' : ''} completados`
            : `Parada ${(paso as { paradaIdx: number }).paradaIdx + 1} de ${plan.length}`}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {/* INICIO */}
      {paso.tipo === 'inicio' && (
        <div className="paso">
          {tieneStock ? (
            <div className="ubicaciones-fifo">
              <h4>Ubicaciones FIFO</h4>
              {ubicacionesResumen.slice(0, 3).map((u, i) => (
                <UbicacionFifo key={u.loteId} ubicacion={u} esActual={i === 0} />
              ))}
              {ubicacionesResumen.length > 3 && (
                <p className="ver-mas">+{ubicacionesResumen.length - 3} ubicaciones más</p>
              )}
            </div>
          ) : (
            <div className="sin-stock-aviso">
              <p>Sin stock disponible para este producto</p>
            </div>
          )}

          <div className="inicio-acciones">
            <button className="btn-primario" onClick={handleIniciarPicking}>
              Iniciar picking
            </button>
            {item.equivalentes.length > 0 && (
              <button className="btn-equivalente" onClick={handleClickEquivalente}>
                {item.equivalentes.length === 1
                  ? `Equivalente: ${item.equivalentes[0].sku}`
                  : 'Equivalente'}
              </button>
            )}
            <button className="btn-secundario" onClick={() => setPaso({ tipo: 'sin_stock' })}>
              Sin stock
            </button>
          </div>
        </div>
      )}

      {/* SELECCIONAR EQUIVALENTE (múltiples disponibles) */}
      {paso.tipo === 'seleccionar_equivalente' && (
        <div className="paso">
          <h4>Selecciona el equivalente</h4>
          <div className="equivalentes">
            {item.equivalentes.map((eq) => (
              <EquivalenteCard
                key={eq.productoId}
                eq={eq}
                seleccionado={false}
                onSeleccionar={() => handleIniciarConEquivalente(eq.productoId)}
              />
            ))}
          </div>
          <button className="btn-secundario" onClick={() => setPaso({ tipo: 'inicio' })}>
            Volver
          </button>
        </div>
      )}

      {/* ESCANEAR RACK */}
      {paso.tipo === 'escanear_rack' && (
        <div className="paso">
          {paradaActual && (
            <div className="instruccion-fifo">
              <p>Dirígete al rack <strong>{paradaActual.posicionCodigo}</strong></p>
              <p className="fecha-fifo">Ingreso: {formatearFecha(paradaActual.fechaIngreso)}</p>
              {esMultiLote && (
                <p className="multilote-tomar">
                  Retirar: <strong>{paradaActual.cantidadATomar}</strong> de {paradaActual.cantidadDisponible} uds disponibles
                </p>
              )}
            </div>
          )}
          <p className="paso-instruccion">Escanea el código de barras del rack</p>
          <div className="input-con-camara">
            <input
              ref={rackInputRef}
              type="text"
              placeholder="Código rack…"
              autoComplete="off"
              onKeyDown={(e) => e.key === 'Enter' && handleEscanearRack(e.currentTarget.value)}
            />
            <BarcodeScanner
              onDetected={(codigo) => {
                if (rackInputRef.current) rackInputRef.current.value = codigo
                handleEscanearRack(codigo)
              }}
              title="Escanear rack"
            />
          </div>
          <div className="paso-acciones">
            <button
              className="btn-secundario"
              disabled={paso.paradaIdx > 0}
              onClick={() => {
                if (paso.paradaIdx === 0) {
                  setPaso({ tipo: 'inicio' })
                  setPickedSoFar(0)
                  setPlan([])
                  setError(null)
                }
              }}
            >
              ← Volver
            </button>
            <button className="btn-primario" onClick={() => handleEscanearRack(rackInputRef.current?.value ?? '')}>
              Confirmar rack
            </button>
          </div>
          {esMultiLote && (
            <button
              className="btn-saltar-parada"
              onClick={() => {
                setMotivo('')
                setError(null)
                setPaso({ tipo: 'motivo_saltar', paradaIdx: paso.paradaIdx, equivalenteId: paso.equivalenteId })
              }}
            >
              Saltar esta parada
            </button>
          )}
          {!equivalenteId && item.equivalentes.length > 0 && paso.paradaIdx === 0 && (
            <button className="btn-equivalente" style={{ marginTop: '8px', width: '100%' }} onClick={handleClickEquivalente}>
              {item.equivalentes.length === 1
                ? `Equivalente: ${item.equivalentes[0].sku}`
                : 'Usar producto equivalente'}
            </button>
          )}
        </div>
      )}

      {/* ESCANEAR PRODUCTO */}
      {paso.tipo === 'escanear_producto' && (
        <div className="paso">
          {paradaActual && (
            <div className="instruccion-fifo">
              <p>Rack: <strong>{paradaActual.posicionCodigo}</strong></p>
              <p className="fecha-fifo">Ingreso: {formatearFecha(paradaActual.fechaIngreso)}</p>
            </div>
          )}
          {equivalenteId && (() => {
            const eq = item.equivalentes.find(e => e.productoId === equivalenteId)
            return eq ? (
              <div className="equiv-asignado-banner">
                <span className="equiv-asignado-label">Equivalente asignado:</span>
                <code className="equiv-asignado-sku">{eq.sku}</code>
              </div>
            ) : null
          })()}
          <p className="paso-instruccion">Escanea el código de barras del producto</p>
          <div className="input-con-camara">
            <input
              ref={productoInputRef}
              type="text"
              inputMode="numeric"
              placeholder="Código producto…"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEscanearProducto(e.currentTarget.value)
              }}
              onInput={(e) => {
                const input = e.currentTarget
                input.value = input.value.replace(/\D/g, '')
              }}
            />
            <BarcodeScanner
              onDetected={(codigo) => {
                if (productoInputRef.current) productoInputRef.current.value = codigo
                handleEscanearProducto(codigo)
              }}
              title="Escanear producto"
            />
          </div>
          <div className="paso-acciones">
            <button
              className="btn-secundario"
              onClick={() => { setError(null); onCerrar() }}
            >
              ← Volver
            </button>
            <button className="btn-secundario" onClick={() => setPaso({ tipo: 'sin_stock' })}>
              Sin stock
            </button>
            <button className="btn-primario" onClick={() => handleEscanearProducto(productoInputRef.current?.value ?? '')}>
              Confirmar
            </button>
          </div>
          {item.equivalentes.length > 0 && (
            <button className="btn-equivalente" style={{ marginTop: '12px', width: '100%' }} onClick={handleClickEquivalente}>
              {equivalenteId
                ? `Equivalente: ${item.equivalentes.find(e => e.productoId === equivalenteId)?.sku ?? '…'}`
                : item.equivalentes.length === 1
                  ? `Equivalente: ${item.equivalentes[0].sku}`
                  : 'Usar producto equivalente'}
            </button>
          )}
        </div>
      )}

      {/* INGRESAR CANTIDAD */}
      {paso.tipo === 'ingresar_cantidad' && (
        <div className="paso">
          {paradaActual && esMultiLote && (
            <p>Retirar de este rack: <strong>{paradaActual.cantidadATomar}</strong> unidades</p>
          )}
          <label>
            Ingrese cantidad:
            <input
              type="number"
              min={1}
              max={paradaActual
                ? Math.min(paradaActual.cantidadDisponible, cantidadPendiente - pickedSoFar)
                : cantidadPendiente}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => { onlyNumbersKeyDown(e); if (e.key === 'Enter') handleConfirmarPicking() }}
              onPaste={onlyNumbersPaste}
              autoFocus
            />
          </label>
          <div className="paso-acciones">
            <button
              className="btn-secundario"
              onClick={() => {
                if (productoInputRef.current) productoInputRef.current.value = ''
                setPaso({ tipo: 'escanear_producto', paradaIdx: paso.paradaIdx, equivalenteId: paso.equivalenteId })
                setError(null)
              }}
            >
              ← Volver
            </button>
            <button
              className="btn-primario"
              disabled={registrarPicking.isPending || !cantidad}
              onClick={handleConfirmarPicking}
            >
              {registrarPicking.isPending
                ? 'Despachando…'
                : esMultiLote && paso.paradaIdx < plan.length - 1
                  ? 'Confirmar y continuar →'
                  : 'Confirmar despacho'}
            </button>
          </div>
        </div>
      )}

      {/* MOTIVO SALTAR PARADA */}
      {paso.tipo === 'motivo_saltar' && (() => {
        const parada = plan[paso.paradaIdx]
        return (
          <div className="paso">
            <p className="text-sm text-amber-400 font-semibold mb-1">
              Saltar rack {parada?.posicionCodigo} — parada {paso.paradaIdx + 1} de {plan.length}
            </p>
            <p className="text-sm text-slate-300 mb-3">Indica el motivo por el cual no se retirará stock de esta ubicación:</p>
            <div className="flex flex-col gap-2 mb-4">
              {MOTIVOS_SALTAR.map((m) => (
                <button
                  key={m}
                  className={`text-left px-4 py-2 rounded-lg border text-sm transition-colors ${
                    motivo === m
                      ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                      : 'border-white/10 bg-slate-800 text-slate-300 hover:border-white/20'
                  }`}
                  onClick={() => setMotivo(m)}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="mb-4">
              <label className="paso-label">Otro motivo</label>
              <textarea
                className="w-full h-20 px-3 py-2 rounded-lg border border-white/10 bg-slate-800 text-sm text-slate-200 placeholder:text-slate-500 resize-none"
                placeholder="Escribe aquí si el motivo es distinto…"
                value={MOTIVOS_SALTAR.includes(motivo) ? '' : motivo}
                onChange={(e) => setMotivo(e.target.value)}
                onFocus={() => { if (MOTIVOS_SALTAR.includes(motivo)) setMotivo('') }}
              />
            </div>
            <div className="paso-acciones">
              <button
                className="btn-secundario"
                onClick={() => {
                  setMotivo('')
                  setError(null)
                  setPaso({ tipo: 'escanear_rack', paradaIdx: paso.paradaIdx, equivalenteId: paso.equivalenteId })
                }}
              >
                ← Volver
              </button>
              <button
                className="btn-primario"
                disabled={!motivo.trim()}
                onClick={() => handleSaltarParada(motivo.trim())}
              >
                Confirmar salto
              </button>
            </div>
          </div>
        )
      })()}

      {/* MOTIVO PARCIAL */}
      {paso.tipo === 'motivo_parcial' && (
        <div className="paso">
          <p className="text-sm text-amber-400 font-semibold mb-1">
            Despacho parcial — {paso.cantidadTotal} de {cantidadPendiente} unidades
          </p>
          <p className="text-sm text-slate-300 mb-3">Indica el motivo por el cual se envía menos de lo solicitado:</p>
          <div className="flex flex-col gap-2 mb-4">
            {MOTIVOS_PRESET.map((m) => (
              <button
                key={m}
                className={`text-left px-4 py-2 rounded-lg border text-sm transition-colors ${
                  motivo === m
                    ? 'border-sky-500 bg-sky-500/20 text-sky-300'
                    : 'border-white/10 bg-slate-800 text-slate-300 hover:border-white/20'
                }`}
                onClick={() => setMotivo(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="mb-4">
            <label className="paso-label">Otro motivo</label>
            <textarea
              className="w-full h-20 px-3 py-2 rounded-lg border border-white/10 bg-slate-800 text-sm text-slate-200 placeholder:text-slate-500 resize-none"
              placeholder="Escribe aquí si el motivo es distinto…"
              value={MOTIVOS_PRESET.includes(motivo) ? '' : motivo}
              onChange={(e) => setMotivo(e.target.value)}
              onFocus={() => { if (MOTIVOS_PRESET.includes(motivo)) setMotivo('') }}
            />
          </div>
          <div className="paso-acciones">
            {!esMultiLote && (
              <button
                className="btn-secundario"
                onClick={() => {
                  setPaso({ tipo: 'ingresar_cantidad', paradaIdx: 0, codigoProducto: paso.codigoProducto, equivalenteId: paso.equivalenteId })
                  setError(null)
                }}
              >
                ← Volver
              </button>
            )}
            <button
              className="btn-primario"
              disabled={registrarPicking.isPending || !motivo.trim()}
              onClick={handleConfirmarConMotivo}
            >
              {registrarPicking.isPending ? 'Despachando…' : 'Confirmar despacho'}
            </button>
          </div>
        </div>
      )}

      {/* RESULTADO */}
      {paso.tipo === 'resultado' && (
        <div className="paso resultado">
          <div className="resultado-ok">
            <span className="icono-ok">✓</span>
            <p>{paso.mensaje}</p>
          </div>
{paso.notaCompleta && (
            <div className="nota-completa-aviso">
              ✓ Nota completada — todos los productos han sido procesados
            </div>
          )}
          <div className="paso-acciones">
            <button className="btn-primario" onClick={onCerrar}>
              Volver a la nota
            </button>
          </div>
        </div>
      )}

      {/* SIN STOCK */}
      {paso.tipo === 'sin_stock' && (
        <SinStockForm
          notaProductoId={item.notaProductoId}
          sku={item.sku}
          usuarioId={usuarioId}
          onCompletado={onCompletado}
          onCancelar={() => { setPaso({ tipo: 'inicio' }); setError(null) }}
        />
      )}
    </div>
  )
}
