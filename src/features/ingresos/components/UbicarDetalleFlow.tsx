import { useState, useRef, useEffect, useMemo } from 'react'
import { ingresosApi } from '../services/ingresos.api'
import { useAlmacenarEnRack, useAlmacenarEnPasillo, usePosicionesConProducto } from '../hooks/useIngresos'
import { useTodasPosicionesLibres, usePasillos, useRacks } from '../../ubicaciones/hooks/useUbicaciones'
import type { PosicionLibre } from '../../ubicaciones/hooks/useUbicaciones'
import { onlyNumbersKeyDown, onlyNumbersPaste } from '../../../shared/utils/numericInput'
import { RACKS_LAYOUT, PASILLOS_LAYOUT } from '../../ubicaciones/config/racksLayout'
import { BarcodeScanner } from '../../../shared/components/BarcodeScanner'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import type { DetalleImportacion, AlmacenarEnRackResult } from '../services/ingresos.api'
type Detalle = DetalleImportacion['detalles'][number]

function IconVolver() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  )
}

const COLOR_RACK_DISPONIBLE = '#4ade80'
const COLOR_RACK_OCUPADO    = '#e8dcc0'

/** Recorte del plano general de bodega — muestra solo los racks del pasillo elegido. */
function PasilloMiniMapa({
  pasilloCodigo,
  racksDisponibles,
  onSeleccionarRack,
}: {
  pasilloCodigo:    string
  racksDisponibles: { rackId: string; rackCodigo: string }[]
  onSeleccionarRack: (rackId: string) => void
}) {
  const racks = Object.values(RACKS_LAYOUT).filter((r) => r.codigo.startsWith(`${pasilloCodigo}-`))
  if (racks.length === 0) return null

  const layoutPasillo   = PASILLOS_LAYOUT[pasilloCodigo]
  const disponiblePorId = new Map(racksDisponibles.map((r) => [r.rackCodigo, r.rackId]))

  // El bounding box debe incluir también la etiqueta "Pasillo X" + flecha:
  // en los pasillos sin bloque a la derecha (E, F) la etiqueta queda más
  // a la derecha que cualquier rack y se recortaría si solo se considera
  // el layout de los racks.
  let minX = Math.min(...racks.map((r) => r.x))
  let minY = Math.min(...racks.map((r) => r.y))
  let maxX = Math.max(...racks.map((r) => r.x + r.width))
  let maxY = Math.max(...racks.map((r) => r.y + r.height))
  if (layoutPasillo) {
    const LABEL_HALF_ANCHO = 55
    minX = Math.min(minX, layoutPasillo.labelX - LABEL_HALF_ANCHO)
    maxX = Math.max(maxX, layoutPasillo.labelX + LABEL_HALF_ANCHO)
    minY = Math.min(minY, layoutPasillo.labelY - 12)
    maxY = Math.max(maxY, layoutPasillo.labelY + 22)
  }

  const PAD = 20
  const vbX = minX - PAD
  const vbY = minY - PAD
  const vbW = maxX - minX + PAD * 2
  const vbH = maxY - minY + PAD * 2

  return (
    <div className="mini-mapa-wrap">
      <svg
        className="mini-mapa-svg"
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Layout de Pasillo ${pasilloCodigo}`}
      >
        {layoutPasillo && (
          <g>
            <text
              x={layoutPasillo.labelX}
              y={layoutPasillo.labelY}
              textAnchor="middle"
              className="mapa-svg-pasillo-label"
            >
              {`Pasillo ${pasilloCodigo}`}
            </text>
            <polygon
              points={`${layoutPasillo.labelX - 7},${layoutPasillo.labelY + 10} ${layoutPasillo.labelX + 7},${layoutPasillo.labelY + 10} ${layoutPasillo.labelX},${layoutPasillo.labelY + 20}`}
              className="mapa-svg-flecha"
            />
          </g>
        )}

        {racks.map((r) => {
          const rackId     = disponiblePorId.get(r.codigo)
          const disponible = !!rackId
          const [, rackNum] = r.codigo.split('-')
          const cx = r.x + r.width / 2
          const cy = r.y + r.height / 2
          return (
            <g
              key={r.codigo}
              className="mapa-svg-rack"
              style={{ cursor: disponible ? 'pointer' : 'not-allowed' }}
              onClick={() => disponible && rackId && onSeleccionarRack(rackId)}
            >
              <rect
                x={r.x}
                y={r.y}
                width={r.width}
                height={r.height}
                rx={2}
                fill={disponible ? COLOR_RACK_DISPONIBLE : COLOR_RACK_OCUPADO}
                opacity={disponible ? 1 : 0.4}
              />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="mapa-svg-rack-label">
                {rackNum}
              </text>
              <title>{disponible ? `${r.codigo} · disponible` : `${r.codigo} · sin posiciones libres`}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

type Paso =
  | { tipo: 'escanear' }
  | { tipo: 'validar'; codigoEscaneado: string }
  | { tipo: 'elegir_destino'; cantidad: number }
  | { tipo: 'elegir_posicion'; cantidad: number; agregarAMismoProducto?: boolean }
  | { tipo: 'resultado'; resultado: AlmacenarEnRackResult; restante: number }

interface Props {
  detalle:       Detalle
  importacionId: string
  adminId:       string
  onCerrar:      () => void
  onExito:       () => void
}

export function UbicarDetalleFlow({ detalle, importacionId, adminId, onCerrar, onExito }: Props) {
  const [paso, setPaso]               = useState<Paso>({ tipo: 'escanear' })
  const [cantidad, setCantidad]       = useState('')
  const [error, setError]             = useState<string | null>(null)
  const [validando, setValidando]     = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [destino, setDestino]               = useState<'rack' | 'pasillo' | null>(null)
  const [posicionId, setPosicionId]         = useState<string | null>(null)
  const [pasilloId, setPasilloId]           = useState<string | null>(null)
  const [selectedPasilloId, setSelectedPasilloId] = useState<string | null>(null)
  const [selectedRackId, setSelectedRackId]       = useState<string | null>(null)
  const [pasillosAbiertos, setPasillosAbiertos] = useState<Record<string, boolean>>({})
  const scanRef = useRef<HTMLInputElement>(null)

  const pendiente = detalle.cantidadEsperada - detalle.cantidadRecibida

  const { data: pasillos }         = usePasillos()
  const { data: posicionesLibres } = useTodasPosicionesLibres()
  const { data: racksDelPasillo }  = useRacks(selectedPasilloId)

  // Agrupar posiciones libres por pasillo → rack
  type GrupoPasillo = {
    pasilloId:     string
    pasilloCodigo: string
    pasilloNombre: string | null
    total:         number
    racks:         { rackId: string; rackCodigo: string; posiciones: PosicionLibre[] }[]
  }

  const grupos = useMemo<GrupoPasillo[]>(() => {
    const mapa = new Map<string, GrupoPasillo>()
    for (const pos of (posicionesLibres ?? [])) {
      let gp = mapa.get(pos.pasilloId)
      if (!gp) {
        gp = { pasilloId: pos.pasilloId, pasilloCodigo: pos.pasilloCodigo, pasilloNombre: pos.pasilloNombre, total: 0, racks: [] }
        mapa.set(pos.pasilloId, gp)
      }
      gp.total++
      let rack = gp.racks.find((r) => r.rackId === pos.rack_id)
      if (!rack) {
        rack = { rackId: pos.rack_id, rackCodigo: pos.rackCodigo, posiciones: [] }
        gp.racks.push(rack)
      }
      rack.posiciones.push(pos)
    }
    const nat = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    const result = Array.from(mapa.values())
    result.sort((a, b) => nat(a.pasilloCodigo, b.pasilloCodigo))
    for (const gp of result) {
      gp.racks.sort((a, b) => nat(a.rackCodigo, b.rackCodigo))
      for (const rack of gp.racks) {
        rack.posiciones.sort((a, b) => nat(a.codigo, b.codigo))
      }
    }
    return result
  }, [posicionesLibres])

  const pasilloLetras = useMemo(() => {
    const mapa = new Map<string, string>()
    grupos.forEach((gp, i) => mapa.set(gp.pasilloId, String.fromCharCode(65 + (i % 26))))
    return mapa
  }, [grupos])

  function etiquetaPasillo(pasilloId: string): string {
    return `Pasillo ${pasilloLetras.get(pasilloId) ?? '?'}`
  }

  function etiquetaRack(pasilloId: string, rackCodigo: string): string {
    const letra  = pasilloLetras.get(pasilloId) ?? '?'
    const numero = rackCodigo.match(/R(\d+)$/)?.[1] ?? rackCodigo
    return `${letra}-R${numero}`
  }

  function etiquetaPosicion(pos: { nivel: number; posicion: string }): string {
    return `${pos.nivel}-${pos.posicion}`
  }

  function togglePasillo(id: string) {
    setPasillosAbiertos((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const { data: posicionesConProducto } = usePosicionesConProducto(detalle.productoId)

  const almacenarRack    = useAlmacenarEnRack(importacionId)
  const almacenarPasillo = useAlmacenarEnPasillo(importacionId)

  // Foco automático en el input de escaneo
  useEffect(() => {
    if (paso.tipo === 'escanear') scanRef.current?.focus()
  }, [paso])

  async function handleEscaneo(codigo: string) {
    if (!codigo.trim()) return
    setError(null)
    setValidando(true)
    try {
      if (!detalle.codigoBarra) {
        setError('Este producto no tiene código de barras registrado')
        return
      }
      if (codigo.trim() !== detalle.codigoBarra) {
        setError(`Código incorrecto — se esperaba el código de barras de ${detalle.sku}`)
        return
      }
      setPaso({ tipo: 'validar', codigoEscaneado: codigo.trim() })
    } finally {
      setValidando(false)
    }
  }

  async function handleValidarCantidad() {
    const cant = parseInt(cantidad, 10)
    if (!cant || cant <= 0) { setError('Ingresa una cantidad válida'); return }
    setError(null)
    setValidando(true)
    try {
      const resultado = await ingresosApi.validarCantidad({
        detalleId:         detalle.detalleId,
        cantidadIngresada: cant,
      })
      if (!resultado.valido) {
        setError(resultado.mensaje)
        return
      }
      setPaso({ tipo: 'elegir_destino', cantidad: cant })
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al validar')
    } finally {
      setValidando(false)
    }
  }

  async function handleConfirmar() {
    if (paso.tipo !== 'elegir_posicion' && paso.tipo !== 'elegir_destino') return
    const cant = paso.tipo === 'elegir_posicion' ? paso.cantidad : (paso as { cantidad: number }).cantidad
    setError(null)
    setIsSubmitting(true)

    try {
      if (destino === 'rack' && posicionId) {
        const agregarAMismoProducto = paso.tipo === 'elegir_posicion' && !!paso.agregarAMismoProducto
        const resultado = await almacenarRack.mutateAsync({
          adminId,
          detalleId:  detalle.detalleId,
          posicionId,
          cantidad:   cant,
          agregarAMismoProducto,
        })
        onExito()
        setPaso({ tipo: 'resultado', resultado, restante: resultado.restante })
      } else if (destino === 'pasillo' && pasilloId) {
        const resultado = await almacenarPasillo.mutateAsync({
          adminId,
          detalleId:  detalle.detalleId,
          pasilloId,
          cantidad:   cant,
        })
        onExito()
        setPaso({
          tipo: 'resultado',
          resultado: {
            loteId:       resultado.loteId,
            codigoRack:   resultado.codigoPasillo,
            cantidad:     resultado.cantidad,
            fechaIngreso: resultado.fechaIngreso,
            restante:     resultado.restante,
          },
          restante: resultado.restante,
        })
      }
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al almacenar')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="ubicar-flow">
      <button className="btn-cerrar ubicar-cerrar" onClick={onCerrar}>✕</button>

      {error && <div className="error-banner">{error}</div>}

      {/* PASO 1: Escanear producto */}
      {paso.tipo === 'escanear' && (
        <div className="paso">
          <button className="btn-volver" onClick={onCerrar}>
            <IconVolver /> Volver
          </button>
          <p>Escanea o escribe el código de barras del producto: <strong>{detalle.sku}</strong></p>
          <div className="barra-busqueda">
            <input
              ref={scanRef}
              type="text"
              placeholder="Código de barras…"
              autoComplete="off"
              disabled={validando}
              onKeyDown={(e) => e.key === 'Enter' && handleEscaneo(e.currentTarget.value)}
            />
            <BarcodeScanner title="Escanear producto" onDetected={(c) => handleEscaneo(c)} />
          </div>
          <button
            className="btn-primario"
            disabled={validando}
            onClick={() => handleEscaneo(scanRef.current?.value ?? '')}
          >
            {validando ? 'Verificando…' : 'Confirmar'}
          </button>
        </div>
      )}

      {/* PASO 2: Ingresar cantidad */}
      {paso.tipo === 'validar' && (
        <div className="paso">
          <button className="btn-volver" onClick={() => setPaso({ tipo: 'escanear' })}>
            <IconVolver /> Volver
          </button>
          <p>Producto: <strong>{detalle.sku}</strong></p>
          <p>Recibido: <strong>{detalle.cantidadRecibida}</strong> · Pendiente: <strong>{pendiente}</strong></p>
          <label>
            Cantidad a ingresar
            <input
              type="number"
              min={1}
              max={pendiente}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => { onlyNumbersKeyDown(e); if (e.key === 'Enter') handleValidarCantidad() }}
              onPaste={onlyNumbersPaste}
              autoFocus
            />
          </label>
          <button className="btn-primario" disabled={validando} onClick={handleValidarCantidad}>
            {validando ? 'Validando…' : 'Siguiente'}
          </button>
        </div>
      )}

      {/* PASO 3: Elegir destino rack o pasillo */}
      {paso.tipo === 'elegir_destino' && (
        <div className="paso">
          <button className="btn-volver" onClick={() => setPaso({ tipo: 'validar', codigoEscaneado: '' })}>
            <IconVolver /> Volver
          </button>

          <p>Cantidad a ubicar: <strong>{paso.cantidad}</strong> unidades</p>

          <div className="destino-container">
            {/* Selección manual — posiciones existentes */}
            {posicionesConProducto && posicionesConProducto.length > 0 && (
              <>
                <p className="destino-subtitulo">Posiciones con este producto</p>
                {posicionesConProducto.map((p) => (
                  <button
                    key={p.posicionId}
                    className="destino-fila"
                    onClick={() => {
                      setDestino('rack')
                      setPosicionId(p.posicionId)
                      setPaso({ tipo: 'elegir_posicion', cantidad: paso.cantidad, agregarAMismoProducto: true })
                    }}
                  >
                    <span className="pe-codigo">{p.codigo}</span>
                    <span className="pe-stock">Stock actual: {p.stockActual} Und</span>
                  </button>
                ))}
                <p className="destino-subtitulo">¿Dónde almacenar?</p>
              </>
            )}

            <button
              className={`destino-fila ${destino === 'rack' ? 'destino-fila--activo' : ''}`}
              onClick={() => {
                setDestino('rack')
                setPosicionId(null)
                setSelectedPasilloId(null)
                setSelectedRackId(null)
                setPaso({ tipo: 'elegir_posicion', cantidad: paso.cantidad })
              }}
            >
              Rack
            </button>
            <button
              className={`destino-fila ${destino === 'pasillo' ? 'destino-fila--activo' : ''}`}
              onClick={() => {
                setDestino('pasillo')
                setPosicionId(null)
                setSelectedPasilloId(null)
                setSelectedRackId(null)
              }}
            >
              Pasillo
            </button>
          </div>

          {destino === 'pasillo' && (
            <div className="seleccionar-pasillo">
              <label>
                Pasillo
                <select value={pasilloId ?? ''} onChange={(e) => setPasilloId(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {(pasillos ?? []).map((p) => (
                    <option key={p.id} value={p.id}>Pasillo {p.codigo}</option>
                  ))}
                </select>
              </label>
              <button
                className="btn-primario"
                disabled={!pasilloId || isSubmitting}
                onClick={handleConfirmar}
              >
                {isSubmitting ? 'Almacenando…' : 'Confirmar pasillo'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* PASO 3b: Elegir posición — Pasillo → Rack → Posición */}
      {paso.tipo === 'elegir_posicion' && (
        <div className="paso">
          <button className="btn-volver" onClick={() => setPaso({ tipo: 'elegir_destino', cantidad: paso.cantidad })}>
            <IconVolver /> Volver
          </button>

          {grupos.length === 0 ? (
            <p className="vacio">No hay posiciones libres disponibles</p>
          ) : (
            <>
              {/* Breadcrumb de selección */}
              <div className="ubicar-breadcrumb">
                <div className={`ubicar-crumb ${!selectedPasilloId ? 'activo' : 'completo'}`}>
                  <span className="crumb-num">1</span>
                  <span className="crumb-label">
                    {selectedPasilloId ? etiquetaPasillo(selectedPasilloId) : 'Pasillo'}
                  </span>
                  {selectedPasilloId && (
                    <button className="crumb-cambiar" onClick={() => { setSelectedPasilloId(null); setSelectedRackId(null); setPosicionId(null) }}>cambiar</button>
                  )}
                </div>
                <span className="crumb-sep">›</span>
                <div className={`ubicar-crumb ${!selectedPasilloId ? 'inactivo' : !selectedRackId ? 'activo' : 'completo'}`}>
                  <span className="crumb-num">2</span>
                  <span className="crumb-label">
                    {selectedRackId && selectedPasilloId
                      ? etiquetaRack(selectedPasilloId, grupos.find(g => g.pasilloId === selectedPasilloId)?.racks.find(r => r.rackId === selectedRackId)?.rackCodigo ?? '')
                      : 'Rack'}
                  </span>
                  {selectedRackId && (
                    <button className="crumb-cambiar" onClick={() => { setSelectedRackId(null); setPosicionId(null) }}>cambiar</button>
                  )}
                </div>
                <span className="crumb-sep">›</span>
                <div className={`ubicar-crumb ${!selectedRackId ? 'inactivo' : !posicionId ? 'activo' : 'completo'}`}>
                  <span className="crumb-num">3</span>
                  <span className="crumb-label">
                    {(() => {
                      const pos = grupos.find(g => g.pasilloId === selectedPasilloId)?.racks.find(r => r.rackId === selectedRackId)?.posiciones.find(p => p.id === posicionId)
                      return posicionId && pos ? etiquetaPosicion(pos) : 'Posición'
                    })()}
                  </span>
                  {posicionId && (
                    <button className="crumb-cambiar" onClick={() => setPosicionId(null)}>cambiar</button>
                  )}
                </div>
              </div>

              {/* Nivel 1: Pasillo */}
              {!selectedPasilloId && !posicionId && (
                <div className="ubicar-nivel">
                  <p className="paso-label paso-label--destacado">Selecciona un pasillo</p>
                  <div className="posiciones-lista">
                    {grupos.map((gp) => (
                      <button
                        key={gp.pasilloId}
                        className="posicion-opcion"
                        onClick={() => { setSelectedPasilloId(gp.pasilloId); setSelectedRackId(null); setPosicionId(null) }}
                      >
                        <span className="codigo">{etiquetaPasillo(gp.pasilloId)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Nivel 2: Rack */}
              {selectedPasilloId && !selectedRackId && !posicionId && (() => {
                const gp = grupos.find(g => g.pasilloId === selectedPasilloId)!
                return (
                  <div className="ubicar-nivel">
                    <p className="paso-label">Selecciona un rack en {etiquetaPasillo(gp.pasilloId)}</p>
                    <PasilloMiniMapa
                      pasilloCodigo={gp.pasilloCodigo}
                      racksDisponibles={gp.racks.map((r) => ({ rackId: r.rackId, rackCodigo: r.rackCodigo }))}
                      onSeleccionarRack={(rackId) => { setSelectedRackId(rackId); setPosicionId(null) }}
                    />
                  </div>
                )
              })()}

              {/* Nivel 3: Posición — tabla por nivel, de arriba (nivel más alto) hacia abajo (nivel 1) */}
              {selectedPasilloId && selectedRackId && !posicionId && (() => {
                const gp   = grupos.find(g => g.pasilloId === selectedPasilloId)!
                const rack = gp.racks.find(r => r.rackId === selectedRackId)!

                const rackCompleto = racksDelPasillo?.find(r => r.id === selectedRackId)
                if (!rackCompleto) return <p className="cargando">Cargando niveles…</p>

                type Slot = { id: string; ocupada: boolean }
                const porNivel = new Map<number, { A?: Slot; B?: Slot }>()
                for (const pos of rackCompleto.posiciones) {
                  const fila = porNivel.get(pos.nivel) ?? {}
                  const slot = { id: pos.id, ocupada: pos.ocupada }
                  if (pos.posicion === 'A') fila.A = slot
                  else if (pos.posicion === 'B') fila.B = slot
                  porNivel.set(pos.nivel, fila)
                }
                const nivelesOrdenados = Array.from(porNivel.keys()).sort((a, b) => b - a)

                return (
                  <div className="ubicar-nivel">
                    <p className="paso-label">Selecciona una posición en {etiquetaRack(gp.pasilloId, rack.rackCodigo)}</p>
                    <div className="posicion-tabla">
                      {nivelesOrdenados.map((nivel) => {
                        const { A, B } = porNivel.get(nivel)!
                        return (
                          <div key={nivel} className="posicion-tabla-grupo">
                            <span className="posicion-tabla-nivel">Nivel {nivel}</span>
                            <div className="posicion-tabla-fila">
                              <div className="posicion-tabla-celda posicion-tabla-celda--a">
                                {A && (
                                  <button
                                    type="button"
                                    className={`posicion-tabla-btn ${A.ocupada ? 'posicion-tabla-btn--ocupado' : ''}`}
                                    disabled={A.ocupada}
                                    onClick={() => setPosicionId(A.id)}
                                  >
                                    {A.ocupada ? 'Posición A · Ocupado' : 'Posición A'}
                                  </button>
                                )}
                              </div>
                              <div className="posicion-tabla-celda posicion-tabla-celda--b">
                                {B && (
                                  <button
                                    type="button"
                                    className={`posicion-tabla-btn ${B.ocupada ? 'posicion-tabla-btn--ocupado' : ''}`}
                                    disabled={B.ocupada}
                                    onClick={() => setPosicionId(B.id)}
                                  >
                                    {B.ocupada ? 'Posición B · Ocupado' : 'Posición B'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Resumen de selección completa */}
              {posicionId && (() => {
                const cantIngresada = paso.tipo === 'elegir_posicion' ? paso.cantidad : 0

                // Posición existente: los datos vienen de posicionesConProducto
                const existente = posicionesConProducto?.find(p => p.posicionId === posicionId)
                if (existente) {
                  const stockTras = existente.stockActual + cantIngresada
                  return (
                    <div className="ubicar-resumen">
                      <span className="resumen-check">✓</span>
                      <div style={{ flex: 1 }}>
                        <p className="resumen-titulo">Agregar a posición existente</p>
                        <p className="resumen-detalle">{existente.codigo}</p>
                        <p className="resumen-dim">Stock actual: {existente.stockActual} uds · tras ingreso: {stockTras} uds</p>
                      </div>
                    </div>
                  )
                }

                // Posición nueva: buscar en el árbol de grupos
                const gp   = grupos.find(g => g.pasilloId === selectedPasilloId)
                const rack = gp?.racks.find(r => r.rackId === selectedRackId)
                const pos  = rack?.posiciones.find(p => p.id === posicionId)
                if (!gp || !rack || !pos) return null
                return (
                  <div className="ubicar-resumen">
                    <span className="resumen-check">✓</span>
                    <div style={{ flex: 1 }}>
                      <p className="resumen-titulo">Posición seleccionada</p>
                      <p className="resumen-detalle">{etiquetaPasillo(gp.pasilloId)} › {etiquetaRack(gp.pasilloId, rack.rackCodigo)} › {etiquetaPosicion(pos)}</p>
                      <p className="resumen-dim">Cantidad a ingresar: {cantIngresada} Und</p>
                    </div>
                  </div>
                )
              })()}
            </>
          )}

          <button
            className="btn-primario"
            disabled={!posicionId || isSubmitting}
            onClick={handleConfirmar}
          >
            {isSubmitting ? 'Almacenando…' : 'Confirmar posición'}
          </button>
        </div>
      )}

      {/* PASO 4: Resultado */}
      {paso.tipo === 'resultado' && (
        <div className="paso resultado">
          <div className="resultado-ok">
            <span className="icono-ok">✓</span>
            <p>
              <strong>{paso.resultado.cantidad}</strong> unidades de <strong>{detalle.sku}</strong>
              {' '}almacenadas en <strong>{paso.resultado.codigoRack}</strong>
            </p>
          </div>

          {/* Regla 4: quedan unidades pendientes */}
          {paso.restante > 0
            ? (
              <div className="alerta-restante">
                <p>Quedan <strong>{paso.restante}</strong> unidades por ubicar</p>
                <button
                  className="btn-primario"
                  onClick={() => {
                    setCantidad('')
                    setPosicionId(null)
                    setPasilloId(null)
                    setDestino(null)
                    setError(null)
                    setPaso({ tipo: 'escanear' })
                  }}
                >
                  Continuar ubicando
                </button>
              </div>
            )
            : (
              <div className="completo">
                <p>✓ Producto completamente ubicado</p>
                <button className="btn-secundario" onClick={onCerrar}>Volver</button>
              </div>
            )
          }
        </div>
      )}
    </div>
  )
}
