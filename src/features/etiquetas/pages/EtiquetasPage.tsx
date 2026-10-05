import { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import { useTodasPosiciones } from '../hooks/useEtiquetas'
import type { PosicionLibre } from '../../ubicaciones/services/ubicaciones.api'

type TamanoEtiqueta = 'normal' | 'grande'

function Etiqueta({ posicion, tamano }: { posicion: PosicionLibre; tamano: TamanoEtiqueta }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    try {
      JsBarcode(svgRef.current, posicion.codigo, {
        format:      'CODE128',
        width:       tamano === 'grande' ? 3 : 2,
        height:      tamano === 'grande' ? 80 : 55,
        displayValue: false,
        margin:      4,
        background:  '#ffffff',
        lineColor:   '#000000',
      })
    } catch (_) { /* código inválido */ }
  }, [posicion.codigo, tamano])

  return (
    <div className={`etiqueta etiqueta--${tamano}`}>
      <div className="etiqueta-header">
        <span className="etiqueta-pasillo">{posicion.pasilloCodigo}</span>
        <span className="etiqueta-rack">{posicion.rackCodigo}</span>
      </div>
      <svg ref={svgRef} className="etiqueta-barcode" />
      <div className="etiqueta-codigo">{posicion.codigo}</div>
      {posicion.nivel && (
        <div className="etiqueta-nivel">Nivel {posicion.nivel}</div>
      )}
    </div>
  )
}

// 2 etiquetas de 15×10 cm por página carta (portrait)
async function generarPDF(filtradas: PosicionLibre[], _tamano: TamanoEtiqueta, nombreArchivo: string) {
  const { jsPDF } = await import('jspdf')

  const PW = 215.9  // carta ancho mm
  const PH = 279.4  // carta alto mm
  const LW = 150    // etiqueta ancho mm
  const LH = 100    // etiqueta alto mm

  // Margen vertical para centrar 2 etiquetas: (PH - 2*LH) / 3
  const marginV = (PH - 2 * LH) / 3
  const marginH = (PW - LW) / 2  // centrado horizontal

  const ySlots = [marginV, marginV + LH + marginV]

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  async function dibujarEtiqueta(pos: PosicionLibre, ox: number, oy: number) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    try {
      JsBarcode(svg, pos.codigo, {
        format:       'CODE128',
        width:        3,
        height:       120,
        displayValue: false,
        margin:       4,
        background:   '#ffffff',
        lineColor:    '#000000',
      })
    } catch (_) { /* código inválido */ }

    const svgStr = new XMLSerializer().serializeToString(svg)
    const url    = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }))

    await new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas  = document.createElement('canvas')
        const scale   = 4
        canvas.width  = (img.naturalWidth  || 400) * scale
        canvas.height = (img.naturalHeight || 130) * scale
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)

        const imgData = canvas.toDataURL('image/png')

        // Fondo blanco + borde fino
        doc.setFillColor(255, 255, 255)
        doc.rect(ox, oy, LW, LH, 'F')
        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.3)
        doc.rect(ox + 2, oy + 2, LW - 4, LH - 4)

        // Cabecera: pasillo · rack
        doc.setFontSize(10)
        doc.setTextColor(100, 100, 100)
        doc.setFont('helvetica', 'normal')
        doc.text(`${pos.pasilloCodigo}  ·  ${pos.rackCodigo}`, ox + LW / 2, oy + 10, { align: 'center' })

        // Código de barras
        doc.addImage(imgData, 'PNG', ox + 8, oy + 14, LW - 16, 55)

        // Código legible en grande
        doc.setFontSize(18)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'bold')
        doc.text(pos.codigo, ox + LW / 2, oy + 82, { align: 'center' })

        // Línea separadora
        doc.setDrawColor(220, 220, 220)
        doc.setLineWidth(0.2)
        doc.line(ox + 10, oy + 86, ox + LW - 10, oy + 86)

        // Pie
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(130, 130, 130)
        doc.text(pos.codigo, ox + LW / 2, oy + 93, { align: 'center' })

        resolve()
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve() }
      img.src = url
    })
  }

  for (let i = 0; i < filtradas.length; i++) {
    const slot = i % 2
    if (i > 0 && slot === 0) doc.addPage('letter')
    await dibujarEtiqueta(filtradas[i], marginH, ySlots[slot])
  }

  doc.save(`${nombreArchivo}.pdf`)
}

export function EtiquetasPage() {
  const { data, isLoading, isError } = useTodasPosiciones()
  const [filtroPasillo, setFiltroPasillo] = useState<string>('todos')
  const [filtroRack,    setFiltroRack]    = useState<string>('todos')
  const [tamano, setTamano]               = useState<TamanoEtiqueta>('normal')
  const [descargando, setDescargando]     = useState(false)

  const posiciones = data ?? []

  const pasillos = Array.from(
    new Map(posiciones.map((p) => [p.pasilloCodigo, p.pasilloCodigo])).values()
  ).sort()

  const porPasillo = filtroPasillo === 'todos'
    ? posiciones
    : posiciones.filter((p) => p.pasilloCodigo === filtroPasillo)

  const racks = Array.from(
    new Map(porPasillo.map((p) => [p.rackCodigo, p.rackCodigo])).values()
  ).sort()

  const filtradas = filtroRack === 'todos'
    ? porPasillo
    : porPasillo.filter((p) => p.rackCodigo === filtroRack)

  function handleCambiarPasillo(valor: string) {
    setFiltroPasillo(valor)
    setFiltroRack('todos')
  }

  function nombreArchivo() {
    if (filtroPasillo === 'todos') return 'etiquetas-todas'
    if (filtroRack === 'todos') return `etiquetas-${filtroPasillo}`
    return `etiquetas-${filtroPasillo}-${filtroRack}`
  }

  async function handleDescargar() {
    if (filtradas.length === 0 || descargando) return
    setDescargando(true)
    try {
      await generarPDF(filtradas, tamano, nombreArchivo())
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="etiquetas-page">

      {/* ── Controles (no se imprimen) ── */}
      <div className="etiquetas-controles no-print">
        <div className="etiquetas-controles-izq">
          <h1 className="etiquetas-titulo">Etiquetas de racks</h1>
          <p className="etiquetas-subtitulo">
            {filtradas.length} posición{filtradas.length !== 1 ? 'es' : ''} · Code 128
          </p>
        </div>
        <div className="etiquetas-controles-der">
          {/* Filtro pasillo */}
          <div className="etiquetas-control-grupo">
            <label>Pasillo</label>
            <select value={filtroPasillo} onChange={(e) => handleCambiarPasillo(e.target.value)}>
              <option value="todos">Todos</option>
              {pasillos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          {/* Filtro rack */}
          <div className="etiquetas-control-grupo">
            <label>Rack</label>
            <select
              value={filtroRack}
              onChange={(e) => setFiltroRack(e.target.value)}
              disabled={filtroPasillo === 'todos'}
            >
              <option value="todos">Todos</option>
              {racks.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {/* Tamaño */}
          <div className="etiquetas-control-grupo">
            <label>Tamaño</label>
            <div className="etiquetas-tamano-btns">
              <button
                className={`etiquetas-tamano-btn${tamano === 'normal' ? ' activo' : ''}`}
                onClick={() => setTamano('normal')}
              >Normal</button>
              <button
                className={`etiquetas-tamano-btn${tamano === 'grande' ? ' activo' : ''}`}
                onClick={() => setTamano('grande')}
              >Grande</button>
            </div>
          </div>
          {/* Descargar PDF */}
          <button
            className="btn-primario etiquetas-btn-imprimir"
            onClick={handleDescargar}
            disabled={descargando || filtradas.length === 0}
          >
            {descargando ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18} style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Generando…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Descargar PDF
              </>
            )}
          </button>
        </div>
      </div>

      {isLoading && <p className="cargando no-print">Cargando posiciones…</p>}
      {isError   && <p className="error no-print">Error al cargar posiciones</p>}

      {!isLoading && !isError && filtradas.length === 0 && (
        <p className="vacio no-print">No hay posiciones registradas</p>
      )}

      {/* ── Grilla de etiquetas ── */}
      <div className={`etiquetas-grid etiquetas-grid--${tamano}`}>
        {filtradas.map((pos) => (
          <Etiqueta key={pos.id} posicion={pos} tamano={tamano} />
        ))}
      </div>

    </div>
  )
}
