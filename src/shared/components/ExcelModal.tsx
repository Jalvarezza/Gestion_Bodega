import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'

type Props = {
  titulo:        string
  url:           string
  nombreArchivo: string
  onCerrar:      () => void
}

type Celda = string | number | boolean | null

type Hoja = {
  nombre:      string
  encabezados: string[]
  filas:       Celda[][]
}

function esNumerico(valor: Celda): boolean {
  return typeof valor === 'number' || (typeof valor === 'string' && valor !== '' && !isNaN(Number(valor)))
}

function formatearCelda(valor: Celda): string {
  if (valor === null || valor === undefined || valor === '') return ''
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (typeof valor === 'number') {
    // Si parece entero o cantidad pequeña, sin decimales; si tiene decimales, mostrar
    return Number.isInteger(valor) ? valor.toLocaleString('es-CL') : valor.toLocaleString('es-CL', { maximumFractionDigits: 2 })
  }
  return String(valor)
}

function detectarColumnasNumericas(encabezados: string[], filas: Celda[][]): boolean[] {
  return encabezados.map((_, ci) => {
    const valoresConDatos = filas.map((f) => f[ci]).filter((v) => v !== null && v !== '')
    if (valoresConDatos.length === 0) return false
    return valoresConDatos.every((v) => esNumerico(v))
  })
}

export function ExcelModal({ titulo, url, nombreArchivo, onCerrar }: Props) {
  const [hojas,      setHojas]      = useState<Hoja[]>([])
  const [hojaActiva, setHojaActiva] = useState(0)
  const [cargando,   setCargando]   = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [busqueda,   setBusqueda]   = useState('')

  useEffect(() => {
    async function cargar() {
      try {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`Error al descargar el archivo (${resp.status})`)
        const buffer = await resp.arrayBuffer()
        const wb     = XLSX.read(buffer, { type: 'array' })

        const resultado: Hoja[] = wb.SheetNames.map((nombre) => {
          const ws   = wb.Sheets[nombre]
          const data = XLSX.utils.sheet_to_json<Celda[]>(ws, { header: 1, defval: null })

          const primeraFila = data.find((f) => f.some((c) => c !== null && c !== ''))
          const encabezados = (primeraFila ?? []).map((c) => String(c ?? '').trim())
          const filas       = data
            .slice(data.indexOf(primeraFila ?? []) + 1)
            .filter((f) => f.some((c) => c !== null && c !== ''))

          return { nombre, encabezados, filas }
        })

        setHojas(resultado)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error desconocido')
      } finally {
        setCargando(false)
      }
    }
    cargar()
  }, [url])

  const hoja = hojas[hojaActiva]

  const columnasNumericas = useMemo(
    () => hoja ? detectarColumnasNumericas(hoja.encabezados, hoja.filas) : [],
    [hoja]
  )

  const filasFiltradas = useMemo(() => {
    if (!hoja) return []
    const q = busqueda.trim().toLowerCase()
    if (!q) return hoja.filas
    return hoja.filas.filter((fila) =>
      fila.some((c) => c !== null && String(c).toLowerCase().includes(q))
    )
  }, [hoja, busqueda])

  return (
    <div className="excel-overlay" onClick={onCerrar}>
      <div className="excel-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="excel-header">
          <div className="excel-header-titulo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
            <h2>{titulo}</h2>
          </div>
          <div className="excel-header-acciones">
            <a href={url} download={nombreArchivo} className="btn-secundario excel-btn-descargar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Descargar
            </a>
            <button className="excel-btn-cerrar" onClick={onCerrar}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Pestañas de hojas */}
        {hojas.length > 1 && (
          <div className="excel-tabs">
            {hojas.map((h, i) => (
              <button
                key={h.nombre}
                className={`excel-tab ${i === hojaActiva ? 'activo' : ''}`}
                onClick={() => { setHojaActiva(i); setBusqueda('') }}
              >
                {h.nombre}
              </button>
            ))}
          </div>
        )}

        {/* Barra de búsqueda + conteo */}
        {!cargando && !error && hoja && hoja.filas.length > 0 && (
          <div className="excel-toolbar">
            <div className="excel-busqueda">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="search"
                placeholder="Buscar en la tabla…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                autoComplete="off"
              />
            </div>
            <span className="excel-conteo">
              {busqueda
                ? `${filasFiltradas.length} de ${hoja.filas.length} filas`
                : `${hoja.filas.length} filas · ${hoja.encabezados.length} columnas`
              }
            </span>
          </div>
        )}

        {/* Contenido */}
        <div className="excel-body">
          {cargando && (
            <div className="excel-estado">
              <span className="spinner" />
              <span>Cargando archivo…</span>
            </div>
          )}
          {error && (
            <div className="excel-estado excel-estado--error">
              <p>{error}</p>
            </div>
          )}

          {!cargando && !error && hoja && (
            hoja.encabezados.length === 0 ? (
              <div className="excel-estado">
                <p>La hoja está vacía</p>
              </div>
            ) : filasFiltradas.length === 0 ? (
              <div className="excel-estado">
                <p>Sin resultados para "<strong>{busqueda}</strong>"</p>
              </div>
            ) : (
              <div className="excel-tabla-wrap">
                <table className="excel-tabla">
                  <thead>
                    <tr>
                      <th className="excel-th excel-th--num">#</th>
                      {hoja.encabezados.map((h, i) => (
                        <th
                          key={i}
                          className={`excel-th${columnasNumericas[i] ? ' excel-th--derecha' : ''}`}
                        >
                          {h || `Col ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filasFiltradas.map((fila, ri) => {
                      // Número de fila original (para búsqueda)
                      const numFila = hoja.filas.indexOf(fila) + 1
                      const esVacia = fila.every((c) => c === null || c === '')
                      if (esVacia) return null
                      return (
                        <tr key={ri} className={ri % 2 === 0 ? 'excel-tr--par' : 'excel-tr--impar'}>
                          <td className="excel-td excel-td--num">{numFila}</td>
                          {hoja.encabezados.map((_, ci) => {
                            const valor  = fila[ci] ?? null
                            const texto  = formatearCelda(valor)
                            const esNum  = columnasNumericas[ci]
                            const esVac  = texto === ''
                            return (
                              <td
                                key={ci}
                                className={`excel-td${esNum ? ' excel-td--derecha' : ''}${esVac ? ' excel-td--vacio' : ''}`}
                                title={texto || undefined}
                              >
                                {esVac ? <span className="excel-celda-vacia">—</span> : texto}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

      </div>
    </div>
  )
}
