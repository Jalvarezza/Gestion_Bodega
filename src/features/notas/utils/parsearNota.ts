import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

export type LineaNota = {
  cantidad:       number
  codigoProducto: string
  descripcion:    string
}

export type ResultadoParseoNota = {
  numeroNota:     string | null
  nombreCliente:  string | null
  rutCliente:     string | null
  numeroOc:       string | null
  productos:      LineaNota[]
  errores:        string[]
  _textoDebug?:   string
}

const REGEX_NV      = /N[°º]\s*de\s*NV[:\s]*(\d+)/i
const REGEX_CLIENTE = /Nombre[:\s]+(.+?)(?:R\.U\.T|$)/im
const REGEX_RUT     = /R\.U\.T\.?[:\s]*([\d.\-kK]+)/i
const REGEX_OC      = /N[°º]\s*OC[:\s]*(\d+)/i

type Item = { str: string; x: number; y: number }

// Agrupa items por filas usando tolerancia en y (±tolerance puntos PDF)
function agruparFilas(items: Item[], tolerance = 4): Item[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const filas: Item[][] = []
  for (const item of sorted) {
    const fila = filas.find((f) => Math.abs(f[0].y - item.y) <= tolerance)
    if (fila) {
      fila.push(item)
      fila.sort((a, b) => a.x - b.x)
    } else {
      filas.push([item])
    }
  }
  return filas
}

export async function parsearNota(file: File): Promise<ResultadoParseoNota> {
  const errores: string[] = []

  const buffer = await file.arrayBuffer()
  const uint8  = new Uint8Array(buffer)

  // Extraer todos los items con posición
  let todosItems: Item[] = []
  let textoPlano = ''
  try {
    const pdf = await pdfjsLib.getDocument({ data: uint8 }).promise
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i)
      const content = await page.getTextContent()
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        todosItems.push({ str: item.str.trim(), x: item.transform[4], y: item.transform[5] })
      }
    }
    // Texto plano ordenado visualmente (para extraer metadatos: NV, cliente, RUT, OC)
    const ordenados = [...todosItems].sort((a, b) => b.y - a.y || a.x - b.x)
    textoPlano = ordenados.map((it) => it.str).join(' ')
  } catch {
    errores.push('No se pudo leer el PDF. Verifica que el archivo no esté dañado.')
    return { numeroNota: null, nombreCliente: null, rutCliente: null, numeroOc: null, productos: [], errores }
  }

  // ── Metadatos ────────────────────────────────────────────────────────────
  const matchNv      = textoPlano.match(REGEX_NV)
  const numeroNota   = matchNv ? matchNv[1] : null
  if (!numeroNota) errores.push('No se encontró el número de NV. Ingrésalo manualmente.')

  const matchCliente  = textoPlano.match(REGEX_CLIENTE)
  const nombreCliente = matchCliente ? matchCliente[1].trim() : null
  if (!nombreCliente) errores.push('No se encontró el nombre del cliente. Ingrésalo manualmente.')

  const matchRut  = textoPlano.match(REGEX_RUT)
  const rutCliente = matchRut ? matchRut[1].trim() : null
  if (!rutCliente) errores.push('No se encontró el RUT del cliente. Ingrésalo manualmente.')

  const matchOc  = textoPlano.match(REGEX_OC)
  const numeroOc = matchOc ? matchOc[1] : null

  // ── Extracción columnar ───────────────────────────────────────────────────
  // 1. Encontrar la fila de encabezado: buscar el item "Cantidad" (o similar)
  const HEADER_CANT   = /^Cantidad$/i
  const HEADER_COD    = /^C[oó]d(i[gó]o)?$/i
  const HEADER_DESC   = /^Descripci[oó]n$/i
  const HEADER_PRECIO = /^(Precio|P\.?\s*Unit(ario)?|Valor|Total|Importe|Neto)$/i
  const FIN_TABLA     = /^(Sub\s*Total|Condici[oó]n|En\s+efectivo|Descuento\s+1)$/i

  const filas = agruparFilas(todosItems)

  // Buscar fila de encabezado (contiene "Cantidad" y "Cod..." en la misma fila)
  let headerFila: Item[] | null = null
  let headerIdx = -1
  for (let i = 0; i < filas.length; i++) {
    const strs = filas[i].map((it) => it.str)
    if (strs.some((s) => HEADER_CANT.test(s)) && strs.some((s) => HEADER_COD.test(s))) {
      headerFila = filas[i]
      headerIdx  = i
      break
    }
  }

  // Fallback: si no encuentra encabezado, usar el parser de texto plano simple
  if (!headerFila || headerIdx === -1) {
    const productos = extraerProductosTextoPlano(textoPlano, errores)
    return { numeroNota, nombreCliente, rutCliente, numeroOc, productos, errores, _textoDebug: textoPlano }
  }

  // 2. Determinar rangos x de cada columna usando los encabezados
  const xCant   = headerFila.find((it) => HEADER_CANT.test(it.str))?.x ?? 0
  const xCod    = headerFila.find((it) => HEADER_COD.test(it.str))?.x ?? 0
  const xDesc   = headerFila.find((it) => HEADER_DESC.test(it.str))?.x ?? 0
  // Límite derecho de descripción: primera columna de precio que aparezca a la derecha de xDesc
  const xPrecio = headerFila
    .filter((it) => HEADER_PRECIO.test(it.str) && it.x > xDesc)
    .sort((a, b) => a.x - b.x)[0]?.x ?? Infinity

  const MARGEN = 12 // tolerancia px — aumentado para capturar códigos que arrancan antes del header

  // 3. Recorrer filas de productos (las que están DEBAJO del encabezado)
  const productos: LineaNota[] = []
  const vistos = new Set<string>()

  for (let i = headerIdx + 1; i < filas.length; i++) {
    const fila = filas[i]
    const strs = fila.map((it) => it.str)

    // Cortar al llegar a footer
    if (strs.some((s) => FIN_TABLA.test(s))) break

    // Items de la columna Cantidad (x cercano a xCant)
    const cantItems = fila.filter((it) => it.x < xCod - MARGEN && it.x >= xCant - MARGEN)
    // Items de la columna Codigo (entre xCod y xDesc)
    const codItems  = fila.filter((it) => it.x >= xCod - MARGEN && it.x < xDesc - MARGEN)

    if (cantItems.length === 0 || codItems.length === 0) continue

    // Cantidad: puede ser "100." → quitar punto final
    let cantStr = cantItems.map((it) => it.str).join('').replace(/\.$/, '').trim()
    // Coma con exactamente 3 dígitos después → separador de miles (ej: "1,000" → 1000)
    // Coma con 1–2 dígitos → decimales de precio (ej: "25,95") → ignorar
    if (/,\d{2}$/.test(cantStr)) continue
    cantStr = cantStr.replace(/,/g, '')
    const cantidad = parseInt(cantStr, 10)
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue

    // Excluir valores con formato de precio chileno (miles con punto o decimales con coma)
    // Ej: "1.500", "1.500,00", "500,00" → precio. "9248", "HX-01", "cg001" → código válido
    const ES_PRECIO = /^\$?\d{1,3}(\.\d{3})+([,]\d+)?$|^\$?\d+[,]\d{2}$/
    const codigoProducto = codItems
      .filter((it) => !ES_PRECIO.test(it.str.trim()))
      .map((it) => it.str.trim()).join('').trim()
    if (!codigoProducto) continue

    // Descripción: entre xDesc y xPrecio (excluye columnas de precio)
    const descItems = fila.filter((it) => it.x >= xDesc - MARGEN && it.x < xPrecio - MARGEN)
    const descripcion = descItems.map((it) => it.str).join(' ').trim() || codigoProducto

    const clave = `${codigoProducto}-${cantidad}`
    if (vistos.has(clave)) continue
    vistos.add(clave)

    productos.push({ cantidad, codigoProducto, descripcion })
  }

  if (productos.length === 0) {
    // Segundo intento con texto plano
    const fallback = extraerProductosTextoPlano(textoPlano, [])
    if (fallback.length > 0) return { numeroNota, nombreCliente, rutCliente, numeroOc, productos: fallback, errores, _textoDebug: textoPlano }
    errores.push('No se encontraron productos. Revisa el formato del PDF.')
  }

  return { numeroNota, nombreCliente, rutCliente, numeroOc, productos, errores, _textoDebug: textoPlano }
}

// ── Fallback: regex sobre texto plano ordenado visualmente ────────────────
// Acepta cualquier código alfanumérico (con -, /, letras y números)
const REGEX_PROD_TEXTO = /(\d+)\.?\s+([A-Za-z0-9][A-Za-z0-9\/\-\.]{2,})\s+(.+?)\s+[\d,.]+\s+[\d,.]+(?=\s|$)/g

function extraerProductosTextoPlano(texto: string, errores: string[]): LineaNota[] {
  const INICIO = /Cantidad\s+C[oó]d/i
  const FIN    = /Sub\s*Total|Condici[oó]n de Pago/i
  const inicio = INICIO.exec(texto)
  const fin    = FIN.exec(texto)
  const cuerpo = inicio
    ? texto.slice(inicio.index + inicio[0].length, fin ? fin.index : undefined)
    : texto

  const productos: LineaNota[] = []
  const vistos = new Set<string>()
  REGEX_PROD_TEXTO.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = REGEX_PROD_TEXTO.exec(cuerpo)) !== null) {
    const cantidad       = parseInt(match[1], 10)
    const codigoProducto = match[2].trim()
    const descripcion    = match[3].trim()
    const clave = `${codigoProducto}-${cantidad}`
    if (vistos.has(clave) || cantidad <= 0) continue
    vistos.add(clave)
    productos.push({ cantidad, codigoProducto, descripcion })
  }
  return productos
}
