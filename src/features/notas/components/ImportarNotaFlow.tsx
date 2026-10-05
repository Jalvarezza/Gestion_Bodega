import { useState, useRef } from 'react'
import { parsearNota }    from '../utils/parsearNota'
import { productosApi }  from '../../productos/services/productos.api'
import { notasApi }      from '../services/notas.api'
import { onlyNumbersKeyDown, onlyNumbersPaste } from '../../../shared/utils/numericInput'

type EstadoBusqueda = 'buscando' | 'encontrado' | 'no_encontrado'

type FilaProducto = {
  codigoProducto:   string
  descripcion:      string
  cantidad:         number
  cantidadEditable: number
  estado:           EstadoBusqueda
  productoId:       string | null
  skuEncontrado:    string | null
  nombreEnDB:       string | null
}

type Props = {
  adminId:  string
  onVolver: () => void
  onCreada: (notaId: string) => void
}

export function ImportarNotaFlow({ adminId, onVolver, onCreada }: Props) {
  const pdfRef = useRef<HTMLInputElement>(null)

  const [archivoPDF, setArchivoPDF] = useState<File | null>(null)

  const [paso,          setPaso]          = useState<'upload' | 'preview'>('upload')
  const [procesando,    setProcesando]    = useState(false)
  const [creando,       setCreando]       = useState(false)
  const [errorUI,       setErrorUI]       = useState<string | null>(null)
  const [erroresParseo, setErroresParseo] = useState<string[]>([])

  const [numeroNota,    setNumeroNota]    = useState('')
  const [nombreCliente, setNombreCliente] = useState('')
  const [rutCliente,    setRutCliente]    = useState('')
  const [numeroOc,            setNumeroOc]            = useState('')
  const [comentarioDespacho,  setComentarioDespacho]  = useState('')
  const [filas,               setFilas]               = useState<FilaProducto[]>([])
  const [textoDebug,    setTextoDebug]    = useState<string | null>(null)

  // ── Paso 1: parsear PDF ───────────────────────────────────────────────────

  async function handleProcesar() {
    if (!archivoPDF) return
    setErrorUI(null)
    setErroresParseo([])
    setProcesando(true)

    const resultado = await parsearNota(archivoPDF)

    if (resultado.errores.length > 0) setErroresParseo(resultado.errores)
    if (resultado.productos.length === 0 && resultado._textoDebug) {
      setTextoDebug(resultado._textoDebug)
    } else {
      setTextoDebug(null)
    }

    setNumeroNota(resultado.numeroNota ?? '')
    setNombreCliente(resultado.nombreCliente ?? '')
    setRutCliente(resultado.rutCliente ?? '')
    setNumeroOc(resultado.numeroOc ?? '')

    const filasBase: FilaProducto[] = resultado.productos.map((p) => ({
      codigoProducto:   p.codigoProducto,
      descripcion:      p.descripcion,
      cantidad:         p.cantidad,
      cantidadEditable: p.cantidad,
      estado:           'buscando' as const,
      productoId:       null,
      skuEncontrado:    null,
      nombreEnDB:       null,
    }))

    setFilas(filasBase)
    setPaso('preview')

    // Algunos PDFs emiten códigos con cero inicial (ej. "09432" → DB guarda "9432").
    // Si el código es solo dígitos, parsearlo como número y reconvertirlo a string.
    function normalizarCodigo(codigo: string): string {
      return /^\d+$/.test(codigo) ? String(parseInt(codigo, 10)) : codigo
    }

    const resoluciones = await Promise.allSettled(
      resultado.productos.map((p) => productosApi.getBySku(normalizarCodigo(p.codigoProducto)))
    )

    setFilas(filasBase.map((fila, i) => {
      const res = resoluciones[i]
      if (res.status === 'fulfilled' && res.value) {
        return {
          ...fila,
          estado:        'encontrado' as const,
          productoId:    res.value.id,
          skuEncontrado: res.value.sku,
          nombreEnDB:    res.value.nombre,
        }
      }
      return { ...fila, estado: 'no_encontrado' as const }
    }))

    setProcesando(false)
  }

  // ── Edición inline ────────────────────────────────────────────────────────

  function actualizarCantidad(idx: number, valor: string) {
    const n = parseInt(valor, 10)
    if (isNaN(n) || n < 1) return
    setFilas((prev) => prev.map((f, i) => i === idx ? { ...f, cantidadEditable: n } : f))
  }

  function eliminarFila(idx: number) {
    setFilas((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Paso 2: crear nota ────────────────────────────────────────────────────

  async function handleCrear() {
    setErrorUI(null)

    if (!numeroNota.trim()) { setErrorUI('El número de NV es obligatorio.'); return }
    if (!nombreCliente.trim()) { setErrorUI('El nombre del cliente es obligatorio.'); return }
    if (!rutCliente.trim()) { setErrorUI('El RUT del cliente es obligatorio.'); return }

    const filasValidas = filas.filter((f) => f.estado === 'encontrado' && f.productoId)
    if (filasValidas.length === 0) {
      setErrorUI('No hay productos encontrados para crear la nota.')
      return
    }

    setCreando(true)
    try {
      const resultado = await notasApi.crearNota({
        adminId,
        numeroNota:    numeroNota.trim(),
        nombreCliente: nombreCliente.trim(),
        rutCliente:    rutCliente.trim(),
        numeroOc:             numeroOc.trim() || undefined,
        archivoNombre:        archivoPDF!.name,
        comentarioDespacho:   comentarioDespacho.trim() || undefined,
        productos: filasValidas.map((f) => ({
          productoId:         f.productoId!,
          cantidadSolicitada: f.cantidadEditable,
        })),
      })

      onCreada(resultado.notaId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión'
      setErrorUI(msg)
    } finally {
      setCreando(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const totalEncontrados   = filas.filter((f) => f.estado === 'encontrado').length
  const totalNoEncontrados = filas.filter((f) => f.estado === 'no_encontrado').length
  const buscandoAun        = filas.some((f) => f.estado === 'buscando')

  return (
    <div className="importar-oc">
      <div className="ing-detalle-header">
        <button className="btn-volver" onClick={onVolver}>← Volver</button>
        <h2
          className="ing-detalle-titulo font-bold text-white tracking-tight"
          style={{ fontSize: 'var(--font-size-xl)' }}
        >
          Nueva nota de venta
        </h2>
      </div>

      {/* ── Paso 1: Upload ── */}
      {paso === 'upload' && (
        <div className="importar-upload-grid">
          <div className="upload-item upload-principal">
            <p className="upload-label-titulo">Nota de Venta (PDF) <span className="requerido">*</span></p>
            <input
              ref={pdfRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => setArchivoPDF(e.target.files?.[0] ?? null)}
            />
            <button
              className={`upload-zona ${archivoPDF ? 'con-archivo' : ''}`}
              onClick={() => pdfRef.current?.click()}
            >
              {archivoPDF ? `📄 ${archivoPDF.name}` : '📎 Seleccionar PDF'}
            </button>
          </div>

          <div className="upload-acciones">
            <button
              className="btn-primario"
              onClick={handleProcesar}
              disabled={!archivoPDF || procesando}
            >
              {procesando ? 'Procesando NV…' : 'Procesar NV'}
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 2: Preview ── */}
      {paso === 'preview' && (
        <>
          {/* Metadata editable — mismo formato que el panel de Importación / NV en preparación */}
          <div className="ing-detalle-meta">
            <div className="ing-meta-item">
              <div>
                <span className="ing-meta-label">N° Nota de Venta <span className="requerido">*</span></span>
                <input
                  className="ing-meta-input"
                  type="text"
                  value={numeroNota}
                  onChange={(e) => setNumeroNota(e.target.value)}
                  placeholder="12345"
                />
              </div>
            </div>
            <div className="ing-meta-item">
              <div>
                <span className="ing-meta-label">Cliente <span className="requerido">*</span></span>
                <input
                  className="ing-meta-input"
                  type="text"
                  value={nombreCliente}
                  onChange={(e) => setNombreCliente(e.target.value)}
                  placeholder="Nombre del cliente"
                />
              </div>
            </div>
            <div className="ing-meta-item">
              <div>
                <span className="ing-meta-label">RUT cliente <span className="requerido">*</span></span>
                <input
                  className="ing-meta-input"
                  type="text"
                  value={rutCliente}
                  onChange={(e) => setRutCliente(e.target.value)}
                  placeholder="12.345.678-9"
                />
              </div>
            </div>
            <div className="ing-meta-item">
              <div>
                <span className="ing-meta-label">N° OC <span className="opcional">opcional</span></span>
                <input
                  className="ing-meta-input"
                  type="text"
                  value={numeroOc}
                  onChange={(e) => setNumeroOc(e.target.value)}
                  placeholder="—"
                />
              </div>
            </div>
            <div className="ing-meta-item">
              <div>
                <span className="ing-meta-label">Archivo</span>
                <span className="ing-meta-valor">{archivoPDF!.name}</span>
              </div>
            </div>
            <div className="ing-meta-item ing-meta-item--full">
              <div>
                <span className="ing-meta-label">Comentario para despacho <span className="opcional">opcional</span></span>
                <textarea
                  className="ing-meta-textarea"
                  rows={2}
                  value={comentarioDespacho}
                  onChange={(e) => setComentarioDespacho(e.target.value)}
                  placeholder="Ej: Entregar con chofer propio, horario restringido, etc."
                />
              </div>
            </div>
          </div>

          {erroresParseo.length > 0 && (
            <ul className="errores-parseo">
              {erroresParseo.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}

          {textoDebug && (
            <details className="debug-texto-pdf">
              <summary>Ver texto extraído del PDF (diagnóstico)</summary>
              <pre className="debug-texto-pre">{textoDebug}</pre>
            </details>
          )}

          {/* Lista de productos — mismo formato que las filas de NV en preparación */}
          <div className="ing-productos-lista">
            {filas.map((fila, idx) => (
              <div key={idx} className="ing-prod-item">
                <div className="ing-prod-fila" style={{ cursor: 'default' }}>
                  <div className="ing-prod-info">
                    <span className="ing-prod-nombre">{fila.descripcion}</span>
                    <code className="ing-prod-sku">{fila.codigoProducto}</code>
                  </div>
                  <div className="ing-prod-fila-derecha">
                    <span className="ing-prod-cantidad">{fila.cantidad}</span>
                    {fila.estado === 'buscando' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} width={18} height={18}><circle cx="12" cy="12" r="10" opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                    )}
                    {fila.estado === 'encontrado' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                    {fila.estado === 'no_encontrado' && (
                      <span className="badge badge-sin-catalogo">No encontrado</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {errorUI && <p className="error">{errorUI}</p>}

          <div className="importar-acciones">
            <button className="btn-secundario" onClick={() => setPaso('upload')}>
              ← Cambiar archivo
            </button>
            <button
              className="btn-primario"
              onClick={handleCrear}
              disabled={creando || buscandoAun || totalEncontrados === 0}
            >
              {creando
                ? 'Creando…'
                : `Crear nota (${totalEncontrados} productos)`}
            </button>
          </div>

          {totalNoEncontrados > 0 && (
            <p className="aviso-no-encontrados">
              Los {totalNoEncontrados} productos no encontrados serán ignorados.
            </p>
          )}
        </>
      )}
    </div>
  )
}
