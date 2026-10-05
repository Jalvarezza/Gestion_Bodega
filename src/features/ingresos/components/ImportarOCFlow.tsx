import { useState, useRef } from 'react'
import { parsearOC }    from '../utils/parsearOC'
import { productosApi } from '../../productos/services/productos.api'
import { ingresosApi }  from '../services/ingresos.api'
import { supabase }     from '../../../lib/supabaseClient'
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
  onCreada: (importacionId: string) => void
}

async function subirArchivo(file: File, path: string): Promise<void> {
  const { error } = await supabase.storage.from('importaciones').upload(path, file, { upsert: true })
  if (error) console.error('Error subiendo', path, ':', error.message)
  else console.log('Subida OK:', path)
}

export function ImportarOCFlow({ adminId, onVolver, onCreada }: Props) {
  const ocRef       = useRef<HTMLInputElement>(null)
  const packingRef  = useRef<HTMLInputElement>(null)

  // Archivos
  const [archivoOC,      setArchivoOC]      = useState<File | null>(null)
  const [archivoPacking, setArchivoPacking] = useState<File | null>(null)

  // UI
  const [paso,      setPaso]      = useState<'upload' | 'preview'>('upload')
  const [procesando, setProcesando] = useState(false)
  const [creando,   setCreando]   = useState(false)
  const [errorUI,   setErrorUI]   = useState<string | null>(null)
  const [erroresParseo, setErroresParseo] = useState<string[]>([])

  // Datos extraídos / editables
  const [numeroOc,  setNumeroOc]  = useState('')
  const [proveedor, setProveedor] = useState('')
  const [filas,     setFilas]     = useState<FilaProducto[]>([])

  // ── Paso 1: procesar OC ───────────────────────────────────────────────────

  async function handleProcesar() {
    if (!archivoOC) return
    setErrorUI(null)
    setErroresParseo([])
    setProcesando(true)

    const resultado = await parsearOC(archivoOC)

    if (resultado.errores.length > 0) {
      setErroresParseo(resultado.errores)
    }

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

    // Buscar SKUs en paralelo
    const resoluciones = await Promise.allSettled(
      resultado.productos.map((p) => productosApi.getBySku(p.codigoProducto))
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

  // ── Paso 2: crear importación ─────────────────────────────────────────────

  async function handleCrear() {
    setErrorUI(null)

    const filasValidas = filas.filter((f) => f.estado === 'encontrado' && f.productoId)
    if (filasValidas.length === 0) {
      setErrorUI('No hay productos encontrados para crear la importación.')
      return
    }
    if (!numeroOc.trim()) {
      setErrorUI('El número de OC es obligatorio.')
      return
    }

    setCreando(true)
    try {
      // 1. Crear la importación en la BD
      const resultado = await ingresosApi.crearImportacion({
        adminId,
        numeroOc:      numeroOc.trim(),
        archivoNombre: archivoOC!.name,
        productos: filasValidas.map((f) => ({
          productoId:       f.productoId!,
          cantidadEsperada: f.cantidadEditable,
        })),
      })

      if (!('importacionId' in resultado)) {
        setErrorUI('Error al crear la importación. Intenta nuevamente.')
        return
      }

      // 2. Subir archivos a Storage: importaciones/{año}/{numeroOC}/
      const año      = new Date().getFullYear()
      const basePath = `${año}/${numeroOc.trim()}`
      await subirArchivo(archivoOC!, `${basePath}/oc.pdf`)
      if (archivoPacking) await subirArchivo(archivoPacking, `${basePath}/packing.pdf`)

      onCreada(resultado.importacionId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión. Verifica tu red e intenta nuevamente.'
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
      <div className="importar-header">
        <button className="btn-volver" onClick={onVolver}>← Volver</button>
        <h2>Nueva importación</h2>
      </div>

      {/* ── Paso 1: Upload ── */}
      {paso === 'upload' && (
        <div className="importar-upload-grid">
          {/* OC — obligatorio */}
          <div className="upload-item upload-principal">
            <p className="upload-label-titulo">Orden de Compra (PDF) <span className="requerido">*</span></p>
            <input
              ref={ocRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => setArchivoOC(e.target.files?.[0] ?? null)}
            />
            <button
              className={`upload-zona ${archivoOC ? 'con-archivo' : ''}`}
              onClick={() => ocRef.current?.click()}
            >
              {archivoOC ? `📄 ${archivoOC.name}` : '📎 Seleccionar PDF'}
            </button>
          </div>

          {/* Packing List — opcional */}
          <div className="upload-item">
            <p className="upload-label-titulo">Packing List (PDF) <span className="opcional">opcional</span></p>
            <input
              ref={packingRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => setArchivoPacking(e.target.files?.[0] ?? null)}
            />
            <button
              className={`upload-zona ${archivoPacking ? 'con-archivo' : ''}`}
              onClick={() => packingRef.current?.click()}
            >
              {archivoPacking ? `📊 ${archivoPacking.name}` : '📎 Adjuntar Packing List'}
            </button>
          </div>

          <div className="upload-acciones">
            <button
              className="btn-primario"
              onClick={handleProcesar}
              disabled={!archivoOC || procesando}
            >
              {procesando ? 'Procesando OC…' : 'Procesar OC'}
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 2: Preview ── */}
      {paso === 'preview' && (
        <>
          {/* Campos editables */}
          <div className="importar-oc-meta">
            <label>
              Número de OC
              <input
                type="text"
                value={numeroOc}
                onChange={(e) => setNumeroOc(e.target.value)}
                placeholder="12345"
              />
            </label>

            <label>
              Proveedor
              <input
                type="text"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor"
              />
            </label>

            {/* Chips de archivos adjuntos */}
            <div className="adjuntos-chips">
              <span className="chip chip-oc">📄 {archivoOC!.name}</span>
              {archivoPacking && (
                <span className="chip chip-adjunto">📎 Packing List adjunto</span>
              )}
            </div>

            {!buscandoAun && (
              <div className="importar-resumen">
                <span className="badge badge-completo">✅ {totalEncontrados} encontrados</span>
                {totalNoEncontrados > 0 && (
                  <span className="badge badge-pendiente">❌ {totalNoEncontrados} no encontrados</span>
                )}
              </div>
            )}
          </div>

          {erroresParseo.length > 0 && (
            <ul className="errores-parseo">
              {erroresParseo.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}

          {/* Tabla de productos */}
          <div className="overflow-x-auto rounded-xl border border-white/10 mb-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Código PDF</th>
                  <th className="px-4 py-3 text-left font-semibold">Descripción PDF</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap w-24">Cantidad</th>
                  <th className="px-4 py-3 text-center font-semibold w-20">Estado</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filas.map((fila, idx) => (
                  <tr
                    key={idx}
                    className={
                      fila.estado === 'encontrado'
                        ? 'bg-emerald-950/30 hover:bg-emerald-950/50'
                        : fila.estado === 'no_encontrado'
                        ? 'bg-red-950/30 hover:bg-red-950/50'
                        : 'bg-slate-900/40 hover:bg-slate-800/50'
                    }
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <code className="font-mono text-xs text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded">
                        {fila.codigoProducto}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-[200px]">
                      <span className="line-clamp-2">{fila.descripcion}</span>
                    </td>
                    <td className="px-4 py-3 w-24">
                      <input
                        type="number"
                        min={1}
                        value={fila.cantidadEditable}
                        onChange={(e) => actualizarCantidad(idx, e.target.value)}
                        onKeyDown={onlyNumbersKeyDown}
                        onPaste={onlyNumbersPaste}
                        disabled={fila.estado !== 'encontrado'}
                        className="w-20 h-9 px-2 text-center rounded-lg border border-white/10 bg-slate-800 text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-sky-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-center text-base">
                      {fila.estado === 'buscando'      && <span>⏳</span>}
                      {fila.estado === 'encontrado'    && <span>✅</span>}
                      {fila.estado === 'no_encontrado' && <span>❌</span>}
                    </td>
                    <td className="px-2 py-3">
                      <button
                        onClick={() => eliminarFila(idx)}
                        title="Quitar esta línea"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {errorUI && <p className="error">{errorUI}</p>}

          <div className="importar-acciones">
            <button className="btn-secundario" onClick={() => setPaso('upload')}>
              ← Cambiar archivos
            </button>
            <button
              className="btn-primario"
              onClick={handleCrear}
              disabled={creando || buscandoAun || totalEncontrados === 0}
            >
              {creando
                ? 'Creando…'
                : `Crear importación (${totalEncontrados} productos)`}
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
