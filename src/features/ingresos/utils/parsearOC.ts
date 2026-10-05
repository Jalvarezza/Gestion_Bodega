import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

export type LineaProducto = {
  cantidad:       number
  codigoProducto: string
  descripcion:    string
}

export type ResultadoParseo = {
  numeroOc:  string | null
  productos: LineaProducto[]
  errores:   string[]
}

const REGEXES_OC = [
  /N[°º]\s*de\s*OC[:\s]*(\d+)/i,
  /P\.?O\.?\s*(?:No|Number|#)[.:\s]*([A-Z0-9\-]+)/i,
  /Order\s+No[.:\s]*([A-Z0-9\-]+)/i,
  /Purchase\s+Order[.:\s]*([A-Z0-9\-]+)/i,
  /OC[.:\s#]*(\d+)/i,
]
const REGEX_PRODUCTO = /(\d+)\s+((?:(?:HX|EK|BOL|BO)-[A-Z0-9\-]+)|(?:LED\s+[A-Z0-9][A-Z0-9\-]+))\s+(.+?)\s+(\d+\.\d+)\s+([\d,]+\.\d+)/g

// Marca que separa el encabezado del cuerpo de productos
const INICIO_TABLA = /Cantidad\s+Codi[gó]o\s+Descripci[oó]n/i

// Marca que indica fin de productos
const FIN_TABLA = /Condici[oó]n de Pago/i

export async function parsearOC(file: File): Promise<ResultadoParseo> {
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

  // Extraer número de OC — probar múltiples patrones
  let numeroOc: string | null = null
  for (const re of REGEXES_OC) {
    const m = texto.match(re)
    if (m?.[1]) { numeroOc = m[1]; break }
  }
  if (!numeroOc) {
    errores.push('No se encontró el número de OC en el documento. Ingrésalo manualmente.')
  }

  // Recortar el texto al rango [inicio_tabla, fin_tabla]
  const inicioMatch = INICIO_TABLA.exec(texto)
  const finMatch    = FIN_TABLA.exec(texto)

  const cuerpo = inicioMatch
    ? texto.slice(
        inicioMatch.index + inicioMatch[0].length,
        finMatch ? finMatch.index : undefined,
      )
    : texto

  // Extraer productos con el regex global
  const productos: LineaProducto[] = []
  const vistos = new Set<string>()
  let match: RegExpExecArray | null

  REGEX_PRODUCTO.lastIndex = 0
  while ((match = REGEX_PRODUCTO.exec(cuerpo)) !== null) {
    const cantidad       = parseInt(match[1], 10)
    const codigoProducto = match[2].trim()
    const descripcion    = match[3].trim()

    const clave = `${codigoProducto}-${cantidad}`
    if (vistos.has(clave)) continue
    vistos.add(clave)

    if (cantidad > 0) {
      productos.push({ cantidad, codigoProducto, descripcion })
    }
  }

  if (productos.length === 0) {
    errores.push('No se encontraron productos. Revisa el formato del PDF o agrégalos manualmente.')
  }

  return { numeroOc, productos, errores }
}
