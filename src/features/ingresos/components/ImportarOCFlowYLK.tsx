import { useState, useRef } from 'react'
import { parsearOC }       from '../utils/parsearOC'
import { productosApi }    from '../../productos/services/productos.api'
import { ingresosApi }     from '../services/ingresos.api'
import { supabase }        from '../../../lib/supabaseClient'
import type { LineaProducto } from '../utils/parsearOC'

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
  desc2:            string | null
}

type Props = {
  adminId:  string
  onVolver: () => void
  onCreada: (importacionId: string) => void
}

async function subirArchivo(file: File, path: string): Promise<void> {
  const { error } = await supabase.storage.from('importaciones').upload(path, file, { upsert: true })
  if (error) console.error('Error subiendo', path, ':', error.message)
}

// Fusiona productos de múltiples OCs sumando cantidades por código
function fusionarProductos(listas: LineaProducto[][]): LineaProducto[] {
  const mapa = new Map<string, LineaProducto>()
  for (const lista of listas) {
    for (const p of lista) {
      const existente = mapa.get(p.codigoProducto)
      if (existente) {
        existente.cantidad += p.cantidad
      } else {
        mapa.set(p.codigoProducto, { ...p })
      }
    }
  }
  return Array.from(mapa.values())
}

export function ImportarOCFlowYLK({ adminId, onVolver, onCreada }: Props) {
  const oc1Ref      = useRef<HTMLInputElement>(null)
  const oc2Ref      = useRef<HTMLInputElement>(null)
  const packingRef  = useRef<HTMLInputElement>(null)

  const [archivoOC1,     setArchivoOC1]     = useState<File | null>(null)
  const [archivoOC2,     setArchivoOC2]     = useState<File | null>(null)
  const [archivoPacking, setArchivoPacking] = useState<File | null>(null)
  const [mostrarOC2,     setMostrarOC2]     = useState(false)

  const [paso,          setPaso]          = useState<'upload' | 'preview'>('upload')
  const [procesando,    setProcesando]    = useState(false)
  const [creando,       setCreando]       = useState(false)
  const [errorUI,       setErrorUI]       = useState<string | null>(null)
  const [erroresParseo, setErroresParseo] = useState<string[]>([])
  const [numeroOc,      setNumeroOc]      = useState('')
  const [filas,         setFilas]         = useState<FilaProducto[]>([])

  async function handleProcesar() {
    if (!archivoOC1) return
    setErrorUI(null)
    setErroresParseo([])
    setProcesando(true)

    // Parsear OC 1 y OC 2 en paralelo (evita compartir estado del regex global entre llamadas secuenciales)
    const [r1, r2] = await Promise.all([
      parsearOC(archivoOC1),
      archivoOC2 ? parsearOC(archivoOC2) : Promise.resolve(null),
    ])

    // Número OC: preferir OC1, sino OC2
    const ocNum = r1.numeroOc ?? r2?.numeroOc ?? ''
    setNumeroOc(ocNum)

    // Mostrar errores relevantes (omitir "OC no encontrada" si ya tenemos el número)
    const errores: string[] = []
    if (!ocNum) errores.push(...r1.errores.filter((e) => e.includes('número de OC')))
    if (r1.productos.length === 0) errores.push(...r1.errores.filter((e) => e.includes('productos')))
    if (r2 && r2.productos.length === 0) errores.push(`OC 2: ${r2.errores.find((e) => e.includes('productos')) ?? 'Sin productos'}`)
    setErroresParseo(errores)

    // Fusionar productos de ambas OCs
    const productosUnidos = fusionarProductos([r1.productos, r2?.productos ?? []])

    if (productosUnidos.length === 0) {
      setErroresParseo((prev) => [...prev, 'No se encontraron productos en la(s) OC(s). Revisa el formato del PDF.'])
    }

    const filasBase: FilaProducto[] = productosUnidos.map((p) => ({
      codigoProducto:   p.codigoProducto,
      descripcion:      p.descripcion,
      cantidad:         p.cantidad,
      cantidadEditable: p.cantidad,
      estado:           'buscando' as const,
      productoId:       null,
      skuEncontrado:    null,
      nombreEnDB:       null,
      desc2:            null,
    }))

    setFilas(filasBase)
    setPaso('preview')

    // Buscar SKUs en paralelo
    const resoluciones = await Promise.allSettled(
      productosUnidos.map((p) => productosApi.getBySku(p.codigoProducto))
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
          desc2:         (res.value as unknown as Record<string, unknown>)['desc_2'] as string | null ?? null,
        }
      }
      return { ...fila, estado: 'no_encontrado' as const }
    }))

    setProcesando(false)
  }

  function actualizarCantidad(idx: number, valor: string) {
    const n = parseInt(valor, 10)
    if (isNaN(n) || n < 1) return
    setFilas((prev) => prev.map((f, i) => i === idx ? { ...f, cantidadEditable: n } : f))
  }

  function eliminarFila(idx: number) {
    setFilas((prev) => prev.filter((_, i) => i !== idx))
  }

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
      const resultado = await ingresosApi.crearImportacion({
        adminId,
        numeroOc:      numeroOc.trim(),
        archivoNombre: archivoOC1!.name,
        productos: filasValidas.map((f) => ({
          productoId:       f.productoId!,
          cantidadEsperada: f.cantidadEditable,
        })),
      })

      if (!('importacionId' in resultado)) {
        const r = resultado as { ok: false; error: { code: string; message: string } }
        setErrorUI(r.error?.message ?? 'Error al crear la importación.')
        return
      }

      const año      = new Date().getFullYear()
      const basePath = `${año}/${numeroOc.trim()}`
      await subirArchivo(archivoOC1!, `${basePath}/oc.pdf`)
      if (archivoOC2) await subirArchivo(archivoOC2, `${basePath}/oc2.pdf`)
      if (archivoPacking) await subirArchivo(archivoPacking, `${basePath}/packing_ylk.pdf`)

      onCreada(resultado.importacionId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión. Verifica tu red e intenta nuevamente.'
      setErrorUI(msg)
    } finally {
      setCreando(false)
    }
  }

  const totalEncontrados   = filas.filter((f) => f.estado === 'encontrado').length
  const totalNoEncontrados = filas.filter((f) => f.estado === 'no_encontrado').length
  const buscandoAun        = filas.some((f) => f.estado === 'buscando')

  return (
    <div className="importar-oc">
      <div className="importar-header">
        <button className="btn-volver" onClick={onVolver}>← Volver</button>
        <h2>Nueva importación — YLK</h2>
      </div>

      {paso === 'upload' && (
        <div className="importar-upload-grid">
          {/* OC 1 — obligatorio */}
          <div className="upload-item upload-principal">
            <p className="upload-label-titulo">
              Orden de Compra (PDF) <span className="requerido">*</span>
            </p>
            <input
              ref={oc1Ref}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => setArchivoOC1(e.target.files?.[0] ?? null)}
            />
            <button
              className={`upload-zona ${archivoOC1 ? 'con-archivo' : ''}`}
              onClick={() => oc1Ref.current?.click()}
            >
              {archivoOC1 ? `📄 ${archivoOC1.name}` : '📎 Seleccionar OC (PDF)'}
            </button>
          </div>

          {/* OC 2 — opcional */}
          {mostrarOC2 ? (
            <div className="upload-item">
              <p className="upload-label-titulo">
                Segunda OC (PDF) <span className="opcional">opcional</span>
                <button
                  className="btn-link-quitar"
                  onClick={() => { setMostrarOC2(false); setArchivoOC2(null) }}
                >
                  ✕ Quitar
                </button>
              </p>
              <input
                ref={oc2Ref}
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={(e) => setArchivoOC2(e.target.files?.[0] ?? null)}
              />
              <button
                className={`upload-zona ${archivoOC2 ? 'con-archivo' : ''}`}
                onClick={() => oc2Ref.current?.click()}
              >
                {archivoOC2 ? `📄 ${archivoOC2.name}` : '📎 Seleccionar segunda OC (PDF)'}
              </button>
            </div>
          ) : (
            <div className="upload-item upload-agregar-oc2">
              <button className="btn-secundario" onClick={() => setMostrarOC2(true)}>
                + Agregar segunda OC
              </button>
              <p className="upload-label-hint">Adjuntar misma OC si tiene mas de 30 productos</p>
            </div>
          )}

          {/* Packing List — opcional */}
          <div className="upload-item">
            <p className="upload-label-titulo">
              Packing List (PDF) <span className="opcional">opcional</span>
            </p>
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
              {archivoPacking ? `📄 ${archivoPacking.name}` : '📎 Adjuntar Packing List'}
            </button>
          </div>

          <div className="upload-acciones">
            <button
              className="btn-primario"
              onClick={handleProcesar}
              disabled={!archivoOC1 || procesando}
            >
              {procesando ? 'Procesando OC…' : 'Procesar OC'}
            </button>
          </div>
        </div>
      )}

      {paso === 'preview' && (
        <>
          <div className="importar-oc-meta">
            <label>
              Número de OC
              <input
                type="text"
                value={numeroOc}
                onChange={(e) => setNumeroOc(e.target.value)}
                placeholder="Ej: 323"
              />
            </label>

            <div className="adjuntos-chips">
              <span className="chip chip-oc">📄 {archivoOC1!.name}</span>
              {archivoOC2 && (
                <span className="chip chip-oc">📄 {archivoOC2.name}</span>
              )}
              {archivoPacking && (
                <span className="chip chip-adjunto">📎 {archivoPacking.name}</span>
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

          <div className="overflow-x-auto rounded-xl border border-white/10 mb-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Código OC</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Desc. 2</th>
                  <th className="px-4 py-3 text-left font-semibold">Descripción PDF</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap w-20">Cantidad</th>
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
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[140px]">
                      <span className="block truncate" title={fila.desc2 ?? ''}>{fila.desc2 ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-[200px]">
                      <span className="line-clamp-2">{fila.descripcion}</span>
                    </td>
                    <td className="px-4 py-3 text-white text-sm font-medium text-right whitespace-nowrap">
                      {fila.cantidadEditable.toLocaleString()}
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
