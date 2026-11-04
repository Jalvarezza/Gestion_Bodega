import { useMemo, useRef, useState } from 'react'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import { pickingMasivoApi } from '../services/pickingMasivo.api'
import type { LineaExcelOC, LineaPrevisualizada } from '../services/pickingMasivo.api'
import { useCrearOrden } from '../hooks/usePickingMasivo'
import { parsearExcelOC } from '../utils/parsearExcelOC'

interface Props {
  usuarioId: string
  onVolver:  () => void
  onCreada:  (id: string) => void
}

export function ImportarOCFlow({ usuarioId, onVolver, onCreada }: Props) {
  const [archivo, setArchivo]           = useState<File | null>(null)
  const [lineasExcel, setLineasExcel]   = useState<LineaExcelOC[]>([])
  const [preview, setPreview]           = useState<LineaPrevisualizada[]>([])
  const [numeroOc, setNumeroOc]         = useState('')
  const [nombreCliente, setNombreCliente] = useState('')
  const [avisos, setAvisos]             = useState<string[]>([])
  const [error, setError]               = useState<string | null>(null)
  const [leyendo, setLeyendo]           = useState(false)
  const [busqueda, setBusqueda]         = useState('')
  const inputArchivo = useRef<HTMLInputElement>(null)
  const crear = useCrearOrden()

  const encontradas   = preview.filter((l) => l.productoId)
  const totalUnidades = encontradas.reduce((t, l) => t + l.cantidad, 0)
  const noEncontradas = preview.length - encontradas.length

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return preview.filter((l) =>
      !q || [l.vin, l.codigoCliente, l.upc, l.nombre, l.descripcion].some((v) => (v ?? '').toLowerCase().includes(q)))
  }, [preview, busqueda])

  async function handleArchivo(file: File | undefined) {
    if (!file) return
    setError(null); setAvisos([]); setPreview([]); setArchivo(file); setLeyendo(true); setBusqueda('')
    try {
      const r = await parsearExcelOC(file)
      setAvisos(r.errores)
      setNumeroOc(r.numeroOc ?? '')
      setLineasExcel(r.lineas)
      if (r.lineas.length) setPreview(await pickingMasivoApi.previsualizar(r.lineas))
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al procesar el Excel')
    } finally {
      setLeyendo(false)
      if (inputArchivo.current) inputArchivo.current.value = ''
    }
  }

  async function handleCrear() {
    setError(null)
    if (!numeroOc.trim())      { setError('Ingresa el número de OC'); return }
    if (!nombreCliente.trim()) { setError('Ingresa el nombre del cliente'); return }
    try {
      const r = await crear.mutateAsync({
        usuarioId,
        numeroOc:      numeroOc.trim(),
        nombreCliente: nombreCliente.trim(),
        archivoNombre: archivo?.name ?? null,
        lineas:        lineasExcel,
      })
      onCreada(r.id)
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al crear la orden')
    }
  }

  const pctEncontradas = preview.length ? Math.round((encontradas.length / preview.length) * 100) : 0

  return (
    <div className="pmo-page">
      <input ref={inputArchivo} type="file" accept=".xlsx,.xls" hidden onChange={(e) => void handleArchivo(e.target.files?.[0])} />

      <div className="pmo-imp">
        <header className="pmo-imp-head">
          <button className="pmo-imp-volver" onClick={onVolver}>← Volver</button>
          <div className="pmo-imp-titulos">
            <h1>{nombreCliente.trim() || 'Nueva orden de compra'}</h1>
            <span>{numeroOc.trim() ? `OC: ${numeroOc.trim()}` : 'Carga el Excel de la OC'}</span>
          </div>
          {archivo && (
            <button className="pmo-imp-archivo-btn" onClick={() => inputArchivo.current?.click()} title={archivo.name}>
              📄 <span>{archivo.name}</span>
            </button>
          )}
        </header>

        {!preview.length && (
          <button className="pmo-imp-drop" onClick={() => inputArchivo.current?.click()} disabled={leyendo}>
            <span className="pmo-imp-drop-icono">📥</span>
            <strong>{leyendo ? 'Leyendo Excel y cruzando con el catálogo…' : 'Seleccionar Excel de la orden de compra'}</strong>
            <span>Formato .xlsx con columnas UPC, SKU, Descripción, VIN y Unidades</span>
          </button>
        )}

        {avisos.length > 0 && <div className="pmo-imp-avisos">{avisos.map((a) => <p key={a}>{a}</p>)}</div>}
        {!preview.length && error && <p className="pmo-imp-error">{error}</p>}

        {preview.length > 0 && (
          <>
            <section className="pmo-imp-paneles">
              <div className="pmo-imp-panel">
                <h2>Datos de la orden</h2>
                <div className="pmo-imp-campos">
                  <label>N° de OC
                    <input value={numeroOc} onChange={(e) => setNumeroOc(e.target.value)} placeholder="Ej: 17649583" />
                  </label>
                  <label>Cliente
                    <input value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} placeholder="Nombre del cliente" autoFocus />
                  </label>
                </div>
              </div>
              <div className="pmo-imp-panel">
                <h2>Cruce con catálogo</h2>
                <div className="pmo-imp-avance">
                  <div className="pmo-barra"><div className="pmo-barra-relleno" style={{ width: `${pctEncontradas}%` }} /></div>
                  <strong>{pctEncontradas}%</strong>
                </div>
                <p className="pmo-imp-total">
                  <strong>{encontradas.length}</strong> / {preview.length} líneas · <strong>{totalUnidades.toLocaleString('es-CL')}</strong> uds
                </p>
              </div>
            </section>

            <div className="pmo-imp-toolbar">
              <input className="pmo-imp-buscar" placeholder="🔍 Buscar por SKU, código cliente o EAN…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              <div className="pmo-chips">
                <span className="pmo-chip pmo-chip--activo">Todos <span>{preview.length}</span></span>
              </div>
            </div>

            <h3 className="pmo-imp-subtitulo">Listado de productos{nombreCliente.trim() ? ` ${nombreCliente.trim()}` : ''}</h3>

            <div className="pmo-imp-lista">
              {visibles.length === 0 && <p className="pmo-vacio">No hay productos con estos filtros</p>}
              {visibles.map((l, i) => {
                return (
                  <div key={`${l.vin}-${i}`} className={`pmo-imp-item ${l.productoId ? '' : 'pmo-imp-item--no'}`}>
                    <div className="pmo-imp-codigos">
                      <span className="pmo-imp-sku">{l.sku ?? l.vin}</span>
                      {l.upc && <span className="pmo-imp-ean">EAN: {l.upc}</span>}
                    </div>
                    <div className="pmo-imp-desc">
                      <span>{l.nombre ?? l.descripcion}</span>
                      {l.codigoCliente && <small>Cód. cliente {l.codigoCliente}</small>}
                    </div>
                    <div className="pmo-imp-cant"><strong>{l.cantidad.toLocaleString('es-CL')}</strong> Uds</div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {preview.length > 0 && (
        <div className="pmo-imp-footer">
          {error && <p className="pmo-imp-error">{error}</p>}
          {noEncontradas > 0 && <span className="pmo-imp-nota">{noEncontradas} líneas no encontradas se omitirán</span>}
          <button className="btn-primario pmo-imp-crear" disabled={crear.isPending || encontradas.length === 0} onClick={() => void handleCrear()}>
            {crear.isPending ? 'Creando…' : 'Crear Orden'}
          </button>
        </div>
      )}
    </div>
  )
}
