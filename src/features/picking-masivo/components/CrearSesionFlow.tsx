import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parsearExcelPicking, type FilaExcelPicking } from '../utils/parsearExcelPicking'
import { parsearExcelConstrumart, consolidarSkusConstrumart, type OrdenConstrumart } from '../utils/parsearExcelConstrumart'
import { parsearExcelImperial } from '../utils/parsearExcelImperial'
import { useActivarSesion, useCrearSesion, useValidarExcel } from '../hooks/usePickingMasivo'
import { useCrearOla, useActivarOla } from '../hooks/useOlas'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import type { ValidarExcelResult } from '../services/picking-masivo.api'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Paso      = 'proveedor' | 'upload' | 'preview' | 'validado'
type Proveedor = 'sodimac' | 'imperial' | 'construmart'

type DatosParseo =
  | { tipo: 'sodimac'; filas: FilaExcelPicking[] }
  | { tipo: 'imperial' | 'construmart'; ordenes: OrdenConstrumart[] }

const ALERTA_LABELS: Record<string, string> = {
  sin_catalogo:       'Sin catálogo',
  sin_stock:          'Sin stock',
  stock_insuficiente: 'Stock insuficiente',
}

const COLUMNAS_PROVEEDOR: Record<Proveedor, string[]> = {
  sodimac:     ['UPC', 'VIN', 'DESCRIPCIÓN', 'CANTIDAD'],
  imperial:    ['OC', 'TIENDA', 'EAN13', 'Cod Proveedor', 'Cantidad', 'LPN'],
  construmart: ['Núm. Orden', 'Guia', 'LPN', 'Cód. Empaque', 'Cod. PLU SAP', 'Cod. Proveedor', 'Nombre Local Destino', 'Unidades Solicitadas'],
}

// ─── Íconos ───────────────────────────────────────────────────────────────────

function IcoBack({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  )
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function CrearSesionFlow({ adminId }: { adminId: string }) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [paso, setPaso]           = useState<Paso>('proveedor')
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [archivo, setArchivo]     = useState<File | null>(null)
  const [datos, setDatos]         = useState<DatosParseo | null>(null)
  const [numeroOc, setNumeroOc]   = useState('')
  const [numeroOcPedido, setNumeroOcPedido] = useState('')
  const [resultado, setResultado] = useState<ValidarExcelResult | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [creando, setCreando]     = useState(false)

  const validarExcel  = useValidarExcel()
  const crearSesion   = useCrearSesion()
  const activarSesion = useActivarSesion()
  const crearOla      = useCrearOla()
  const activarOla    = useActivarOla()

  function seleccionarProveedor(p: Proveedor) {
    setProveedor(p)
    setArchivo(null)
    setDatos(null)
    setError(null)
    setNumeroOc('')
    setNumeroOcPedido('')
    setPaso('upload')
  }

  async function handleArchivoSeleccionado(file: File) {
    setError(null)
    setArchivo(file)
    try {
      if (proveedor === 'construmart') {
        const res = await parsearExcelConstrumart(file)
        if (res.errores.length > 0 && res.totalLineas === 0) {
          setError(res.errores.join(' — '))
          return
        }
        if (res.errores.length > 0) setError(res.errores.join(' — '))
        setDatos({ tipo: 'construmart', ordenes: res.ordenes })
      } else if (proveedor === 'imperial') {
        const res = await parsearExcelImperial(file)
        if (res.errores.length > 0 && res.totalLineas === 0) {
          setError(res.errores.join(' — '))
          return
        }
        if (res.errores.length > 0) setError(res.errores.join(' — '))
        setDatos({ tipo: 'imperial', ordenes: res.ordenes })
      } else {
        const res = await parsearExcelPicking(file)
        if (res.errores.length > 0) {
          setError(res.errores.join(' — '))
          return
        }
        setDatos({ tipo: proveedor!, filas: res.filas })
      }
      setPaso('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo')
    }
  }

  async function handleValidar() {
    if (!numeroOc.trim()) { setError('Ingresa la fecha de entrega'); return }
    if (proveedor === 'sodimac' && !numeroOcPedido.trim()) { setError('Ingresa el número de OC (obligatorio para Sodimac)'); return }
    if (!datos) return
    setError(null)

    try {
      if (datos.tipo === 'construmart' || datos.tipo === 'imperial') {
        setPaso('validado')
        return
      }

      const res = await validarExcel.mutateAsync({
        items: datos.tipo === 'sodimac' ? datos.filas.map((f) => ({
          codigo:         f.codigo,
          descripcion:    f.descripcion,
          cantidadPedida: f.cantidadPedida,
          codigoBarra:    f.codigoBarra,
          lpn:            f.lpn,
          tienda:         f.tienda,
          skuProveedor:   f.skuProveedor,
        })) : [],
      })
      setResultado(res)
      setPaso('validado')
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al validar el archivo')
    }
  }

  async function handleConfirmar() {
    if (!datos || !proveedor) return
    setCreando(true)
    setError(null)

    try {
      if (datos.tipo === 'construmart' || datos.tipo === 'imperial') {
        const { olaId } = await crearOla.mutateAsync({
          usuarioId:    adminId,
          proveedor:    datos.tipo,
          fechaEntrega: numeroOc.trim(),
          archivoNombre: archivo?.name ?? 'excel.xlsx',
          ordenes:      datos.ordenes,
        })
        await activarOla.mutateAsync({ olaId, usuarioId: adminId })
        navigate(`/picking-masivo/ola/${olaId}`)
        return
      }

      if (!resultado) return
      const { sesionId } = await crearSesion.mutateAsync({
        usuarioId:       adminId,
        numeroOc:        numeroOc.trim(),
        nombreCliente:   proveedor === 'sodimac' ? 'Sodimac' : 'Imperial',
        numeroOcPedido:  numeroOcPedido.trim() || undefined,
        archivoNombre:   archivo?.name ?? 'excel.xlsx',
        items: resultado.items.map((i) => ({
          codigo:         i.codigo,
          descripcion:    i.descripcion,
          cantidadPedida: i.cantidadPedida,
          productoId:     i.productoId,
          codigoBarra:    i.codigoBarra,
          lpn:            i.lpn,
          tienda:         i.tienda,
          skuProveedor:   i.skuProveedor,
        })),
      })
      await activarSesion.mutateAsync({ sesionId, usuarioId: adminId })
      navigate(`/picking-masivo/${sesionId}`)
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al crear la sesión')
      setCreando(false)
    }
  }

  const totalLineas = datos
    ? datos.tipo === 'sodimac'
      ? datos.filas.length
      : datos.ordenes.reduce((s, o) => s + o.lineas.length, 0)
    : 0

  return (
    <div className="notas-page">
      <div className="ing-detalle-header">
        <button className="btn-volver" onClick={() => {
          if (paso === 'proveedor') navigate('/picking-masivo')
          else if (paso === 'upload') setPaso('proveedor')
          else if (paso === 'preview') setPaso('upload')
          else setPaso('preview')
        }}>
          <IcoBack /> Volver
        </button>
        <h1 className="notas-titulo">Nueva sesión de picking masivo</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* ── Paso 1: Selección de proveedor ── */}
      {paso === 'proveedor' && (
        <div className="paso">
          <p className="pm-upload-subtitulo">Selecciona el proveedor para esta sesión</p>
          <div className="pm-proveedor-grid">
            {([
              { id: 'sodimac',    label: 'Sodimac',    desc: 'Picking por posición FIFO' },
              { id: 'imperial',   label: 'Imperial',   desc: 'Wave picking · LPN por tienda' },
              { id: 'construmart', label: 'Construmart', desc: 'Wave picking · LPN por tienda' },
            ] as const).map(({ id, label, desc }) => (
              <button
                key={id}
                className="pm-proveedor-card"
                onClick={() => seleccionarProveedor(id)}
              >
                <span className="pm-proveedor-nombre">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Paso 2: Carga del archivo ── */}
      {paso === 'upload' && proveedor && (
        <div className="paso">
          <div className="pm-upload-aviso">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>
              Formato <strong>{proveedor.charAt(0).toUpperCase() + proveedor.slice(1)}</strong> — columnas requeridas:{' '}
              {COLUMNAS_PROVEEDOR[proveedor].map((col, i, arr) => (
                <span key={col}>
                  <code className="pm-col-badge">{col}</code>
                  {i < arr.length - 1 ? ', ' : '.'}
                </span>
              ))}
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleArchivoSeleccionado(f) }}
          />
          <button className="upload-zona" onClick={() => inputRef.current?.click()}>
            {archivo ? `📄 ${archivo.name}` : '📎 Seleccionar Excel'}
          </button>
        </div>
      )}

      {/* ── Paso 3: Preview ── */}
      {paso === 'preview' && datos && (
        <div className="paso">
          {/* Datos de la sesión — Sodimac */}
          {datos.tipo === 'sodimac' && (
            <>
              <div className="ing-filtro-grupo">
                <span className="ing-filtro-label">Número de OC <span style={{ color: 'var(--danger)' }}>*</span></span>
                <input
                  className="ing-filtro-select"
                  value={numeroOcPedido}
                  onChange={(e) => setNumeroOcPedido(e.target.value)}
                  placeholder="Ej: 4500012345"
                  autoFocus
                />
              </div>
              <div className="ing-filtro-grupo">
                <span className="ing-filtro-label">Fecha de entrega</span>
                <input
                  className="ing-filtro-select"
                  value={numeroOc}
                  onChange={(e) => setNumeroOc(e.target.value)}
                  placeholder="Ej: 28-09-2026"
                />
              </div>
              <p className="notas-conteo">{datos.filas.length} línea{datos.filas.length !== 1 ? 's' : ''} detectada{datos.filas.length !== 1 ? 's' : ''}</p>
              <div className="excel-tabla-wrap">
                <table className="excel-tabla">
                  <thead>
                    <tr>
                      <th className="excel-th excel-th--num">#</th>
                      <th className="excel-th">Código</th>
                      <th className="excel-th excel-th--derecha">Cantidad</th>
                      {datos.filas.some((f) => f.codigoBarra) && <th className="excel-th">EAN / UPC</th>}
                      {datos.filas.some((f) => f.lpn)         && <th className="excel-th">LPN</th>}
                      {datos.filas.some((f) => f.tienda)      && <th className="excel-th">Tienda</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {datos.filas.map((f, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'excel-tr--par' : 'excel-tr--impar'}>
                        <td className="excel-td excel-td--num">{i + 1}</td>
                        <td className="excel-td">{f.codigo}</td>
                        <td className="excel-td excel-td--derecha">{f.cantidadPedida}</td>
                        {datos.filas.some((f2) => f2.codigoBarra) && <td className="excel-td">{f.codigoBarra ?? '—'}</td>}
                        {datos.filas.some((f2) => f2.lpn)         && <td className="excel-td">{f.lpn ?? '—'}</td>}
                        {datos.filas.some((f2) => f2.tienda)      && <td className="excel-td">{f.tienda ?? '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Preview Imperial — agrupado por OC */}
          {datos.tipo === 'imperial' && (
            <>
              <p className="pm-prev-titulo">Detalle completo de planilla Imperial</p>
              <div className="pm-prev-fecha-wrap">
                <label className="pm-prev-fecha-label">Fecha de entrega</label>
                <div className="pm-prev-fecha-input-wrap">
                  <input
                    className="pm-prev-fecha-input"
                    value={numeroOc}
                    onChange={(e) => setNumeroOc(e.target.value)}
                    placeholder="Ej: 28-09-2026"
                    autoFocus
                  />
                  <span className="pm-prev-fecha-ico">📅</span>
                </div>
              </div>
              <div className="excel-tabla-wrap">
                <table className="excel-tabla">
                  <thead>
                    <tr>
                      <th className="excel-th">OC</th>
                      <th className="excel-th">LPN</th>
                      <th className="excel-th">SKU Proveedor</th>
                      <th className="excel-th">Tienda</th>
                      <th className="excel-th excel-th--derecha">Uds.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.ordenes.flatMap((o, oi) =>
                      o.lineas.map((l, li) => (
                        <tr key={`${oi}-${li}`} className={`${oi % 2 === 0 ? 'excel-tr--par' : 'excel-tr--impar'}${li === 0 ? ' excel-tr--orden-inicio' : ''}`}>
                          {li === 0 && <td className="excel-td excel-td--orden" rowSpan={o.lineas.length}>{o.numeroOrden}</td>}
                          <td className="excel-td" style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{l.lpn}</td>
                          <td className="excel-td">{l.skuProveedor}</td>
                          <td className="excel-td">{l.tienda}</td>
                          <td className="excel-td excel-td--derecha">{l.cantidadSolicitada}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Preview Construmart — agrupado por OC */}
          {datos.tipo === 'construmart' && (
            <>
              <p className="pm-prev-titulo">Detalle completo de planilla Construmart</p>

              {/* Fecha de entrega */}
              <div className="pm-prev-fecha-wrap">
                <label className="pm-prev-fecha-label">Fecha de entrega</label>
                <div className="pm-prev-fecha-input-wrap">
                  <input
                    className="pm-prev-fecha-input"
                    value={numeroOc}
                    onChange={(e) => setNumeroOc(e.target.value)}
                    placeholder="Ej: 28-09-2026"
                    autoFocus
                  />
                  <span className="pm-prev-fecha-ico">📅</span>
                </div>
              </div>
              <div className="excel-tabla-wrap">
                <table className="excel-tabla">
                  <thead>
                    <tr>
                      <th className="excel-th">Núm. Orden</th>
                      <th className="excel-th">Guia</th>
                      <th className="excel-th">LPN</th>
                      <th className="excel-th">SKU Proveedor</th>
                      <th className="excel-th">Tienda</th>
                      <th className="excel-th excel-th--derecha">Uds.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.ordenes.flatMap((o, oi) =>
                      o.lineas.map((l, li) => (
                        <tr key={`${oi}-${li}`} className={`${oi % 2 === 0 ? 'excel-tr--par' : 'excel-tr--impar'}${li === 0 ? ' excel-tr--orden-inicio' : ''}`}>
                          {li === 0 && <td className="excel-td excel-td--orden" rowSpan={o.lineas.length}>{o.numeroOrden}</td>}
                          {li === 0 && <td className="excel-td" rowSpan={o.lineas.length} style={{ verticalAlign: 'middle' }}>{o.numeroGuia}</td>}
                          <td className="excel-td" style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{l.lpn}</td>
                          <td className="excel-td">{l.skuProveedor}</td>
                          <td className="excel-td">{l.tienda}</td>
                          <td className="excel-td excel-td--derecha">{l.cantidadSolicitada}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => { setPaso('upload'); setArchivo(null); setDatos(null) }}>
              <IcoBack /> Volver
            </button>
            <button className="btn-primario" disabled={validarExcel.isPending} onClick={handleValidar}>
              {validarExcel.isPending ? 'Validando…' : 'Cargar'}
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 4: Resultado validación ── */}
      {paso === 'validado' && (
        <div className="paso">
          {/* Sodimac / Imperial */}
          {resultado && (
            <>
              <p className="pm-validado-resumen">
                {resultado.totalItems} ítems · {resultado.conCatalogo} en catálogo · {resultado.sinStock} sin stock
              </p>
              {resultado.alertas.length > 0 && (
                <div className="pm-alertas-lista">
                  {resultado.alertas.map((a, i) => (
                    <div key={i} className="pm-alerta-fila">
                      <div className="pm-alerta-izq">
                        <span className="pm-alerta-codigo">{a.codigo}</span>
                        {a.stockActual !== undefined && (
                          <span className="pm-alerta-stock">Stock: {a.stockActual} · Solicitado: {a.solicitado ?? 0}</span>
                        )}
                      </div>
                      <span className={`badge badge-${a.tipo.replace(/_/g, '-')}`}>{ALERTA_LABELS[a.tipo] ?? a.tipo}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Construmart / Imperial — resumen wave */}
          {(datos?.tipo === 'construmart' || datos?.tipo === 'imperial') && (
            <div className="pm-validado-resumen">
              <p>Ola lista para crear</p>
              <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: 4 }}>
                {datos.ordenes.length} OC{datos.ordenes.length !== 1 ? 's' : ''} · {totalLineas} LPNs ·{' '}
                {consolidarSkusConstrumart(datos.ordenes).length} SKUs consolidados
              </p>
            </div>
          )}

          <div className="paso-acciones">
            <button className="btn-secundario" onClick={() => setPaso('preview')}>
              <IcoBack /> Volver
            </button>
            <button className="btn-primario" disabled={creando} onClick={handleConfirmar}>
              {creando ? 'Creando…' : 'Confirmar y activar sesión'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
