import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

export type LineaProductoYLK = {
  codigoProducto: string
  descripcion:    string
  cantidad:       number
}

export type ResultadoParseoYLK = {
  numeroOc:  string | null
  productos: LineaProductoYLK[]
  errores:   string[]
}

// Invoice No: ej. I260049
const REGEX_INVOICE = /INVOICE\s+NO[:\s]+([A-Z]\d+)/i

// Línea de producto YLK:
//   CODE  DESCRIPCION  HS_CODE  QTY  CTNS  GW/total  NW/total  Meas/total
// - CODE: 5 dígitos o YLK-\w+
// - HS_CODE: 6 dígitos empezando con 8 (se omite en captura)
// - QTY y CTNS: enteros
// - GW, NW, Meas: formato float/float
const REGEX_PRODUCTO = /\b(\d{5}|YLK-\w+)\b\s+(.*?)\s+8\d{5}\s+(\d+)\s+\d+\s+[\d.]+\/[\d.]+\s+[\d.]+\/[\d.]+\s+[\d.]+\/[\d.]+/g

// Líneas de totales a ignorar para no confundir el parser
const REGEX_IGNORAR = /^(Subtotal|Total|Part Of|DESCRIPTION|REF|QTY|CTN)/i

export async function parsearYLK(file: File): Promise<ResultadoParseoYLK> {
  const errores: string[] = []

  const buffer = await file.arrayBuffer()
  const uint8  = new Uint8Array(buffer)

  let texto = ''
  try {
    const pdf    = await pdfjsLib.getDocument({ data: uint8 }).promise
    const partes: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i)
      const content = await page.getTextContent()
      partes.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
    }
    texto = partes.join(' ')
  } catch {
    errores.push('No se pudo leer el PDF. Verifica que el archivo no esté dañado.')
    return { numeroOc: null, productos: [], errores }
  }

  // Extraer Invoice No como referencia
  const matchInvoice = texto.match(REGEX_INVOICE)
  const numeroOc     = matchInvoice ? matchInvoice[1] : null
  if (!numeroOc) {
    errores.push('No se encontró el número de Invoice en el documento. Ingrésalo manualmente.')
  }

  // Acumular cantidades por código (mismo producto puede aparecer en múltiples contenedores)
  const totales = new Map<string, { descripcion: string; cantidad: number }>()

  let match: RegExpExecArray | null
  REGEX_PRODUCTO.lastIndex = 0

  while ((match = REGEX_PRODUCTO.exec(texto)) !== null) {
    const codigoProducto = match[1].trim()
    const descripcion    = match[2].trim().replace(/\s+/g, ' ')
    const cantidad       = parseInt(match[3], 10)

    if (cantidad <= 0 || REGEX_IGNORAR.test(descripcion)) continue

    const existente = totales.get(codigoProducto)
    if (existente) {
      existente.cantidad += cantidad
    } else {
      totales.set(codigoProducto, { descripcion, cantidad })
    }
  }

  const productos: LineaProductoYLK[] = Array.from(totales.entries()).map(
    ([codigoProducto, { descripcion, cantidad }]) => ({ codigoProducto, descripcion, cantidad })
  )

  if (productos.length === 0) {
    errores.push('No se encontraron productos. Revisa el formato del PDF.')
  }

  return { numeroOc, productos, errores }
}
