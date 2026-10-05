import * as XLSX from 'xlsx'

export type FilaExcelPicking = {
  codigo:         string
  descripcion:    string
  cantidadPedida: number
  codigoBarra?:   string
  lpn?:           string
  tienda?:        string
  skuProveedor?:  string
}

export type ResultadoParseoPicking = {
  filas:   FilaExcelPicking[]
  errores: string[]
}

type Celda = string | number | boolean | null

// Orden de prioridad: el alias más específico primero gana sobre los genéricos.
// Sodimac: VIN = nuestro SKU (columna "VIN (codigo producto)")
// Imperial: "Codigo producto" = nuestro SKU
// Genérico: "sku", "codigo", "cod"
const ALIAS_CODIGO        = ['vin', 'codigo producto', 'codigo', 'cod', 'sku']
const ALIAS_DESCRIPCION   = ['descripcion', 'description', 'producto', 'nombre', 'detalle']
const ALIAS_CANTIDAD      = ['unidades', 'cantidad pedida', 'cantidad', 'cant', 'qty']
const ALIAS_CODIGO_BARRA  = ['upc', 'ean13', 'ean', 'codigo barra', 'codigo de barra', 'barcode']
const ALIAS_LPN           = ['lpn']
const ALIAS_TIENDA        = ['tienda', 'store', 'sucursal']
const ALIAS_SKU_PROVEEDOR = ['sku']

function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Busca en orden de alias (prioridad), no en orden de columnas.
// Soporta match exacto y match por prefijo (ej: "VIN (codigo producto)" matchea alias "vin").
function encontrarColumna(encabezados: string[], alias: string[]): number {
  const norm = encabezados.map(normalizar)
  for (const a of alias) {
    const idx = norm.findIndex((h) => h === a || h.startsWith(a + ' ') || h.startsWith(a + '('))
    if (idx !== -1) return idx
  }
  return -1
}

export async function parsearExcelPicking(file: File): Promise<ResultadoParseoPicking> {
  const errores: string[] = []
  const buffer = await file.arrayBuffer()
  // cellText:true preserva el formato de celda (ej: "09290" no pierde el cero inicial)
  const wb     = XLSX.read(buffer, { type: 'array', cellText: true, cellDates: true })
  const ws     = wb.Sheets[wb.SheetNames[0]]
  const data   = XLSX.utils.sheet_to_json<Celda[]>(ws, { header: 1, defval: null, raw: false })

  const primeraFila = data.find((f) => f.some((c) => c !== null && c !== ''))
  if (!primeraFila) {
    errores.push('El archivo está vacío')
    return { filas: [], errores }
  }

  const encabezados = primeraFila.map((c) => String(c ?? '').trim())
  const filasDatos  = data
    .slice(data.indexOf(primeraFila) + 1)
    .filter((f) => f.some((c) => c !== null && c !== ''))

  const idxCodigo       = encontrarColumna(encabezados, ALIAS_CODIGO)
  const idxDescripcion  = encontrarColumna(encabezados, ALIAS_DESCRIPCION)
  const idxCantidad     = encontrarColumna(encabezados, ALIAS_CANTIDAD)
  const idxCodigoBarra  = encontrarColumna(encabezados, ALIAS_CODIGO_BARRA)
  const idxLpn          = encontrarColumna(encabezados, ALIAS_LPN)
  const idxTienda       = encontrarColumna(encabezados, ALIAS_TIENDA)
  // SKU proveedor: solo cuando existe columna "SKU" separada de la columna de código interno
  const idxSkuProveedor = (() => {
    const idx = encontrarColumna(encabezados, ALIAS_SKU_PROVEEDOR)
    return idx !== -1 && idx !== idxCodigo ? idx : -1
  })()

  if (idxCodigo === -1 || idxCantidad === -1) {
    errores.push('No se encontraron las columnas código / cantidad en el archivo')
    return { filas: [], errores }
  }

  if (idxCodigoBarra === -1) {
    errores.push('El archivo no contiene columna de código de barras (UPC / EAN). Agrega una columna con encabezado "UPC", "EAN13", "EAN" o "Codigo Barra" e intenta de nuevo.')
    return { filas: [], errores }
  }

  const filas: FilaExcelPicking[] = []
  for (const fila of filasDatos) {
    const codigo      = String(fila[idxCodigo] ?? '').trim()
    const descripcion = idxDescripcion !== -1 ? String(fila[idxDescripcion] ?? '').trim() : codigo
    // Limpiar separadores de miles antes de convertir (ej: "1.000" o "1,000" → 1000)
    const cantidadStr = String(fila[idxCantidad] ?? '').replace(/[.,](?=\d{3}(?:[.,]|$))/g, '').replace(',', '.')
    const cantidad    = parseFloat(cantidadStr)
    if (!codigo || !Number.isFinite(cantidad) || cantidad <= 0) continue
    const codigoBarra  = idxCodigoBarra  !== -1 ? String(fila[idxCodigoBarra]  ?? '').trim() || undefined : undefined
    const lpn          = idxLpn          !== -1 ? String(fila[idxLpn]          ?? '').trim() || undefined : undefined
    const tienda       = idxTienda       !== -1 ? String(fila[idxTienda]       ?? '').trim() || undefined : undefined
    const skuProveedor = idxSkuProveedor !== -1 ? String(fila[idxSkuProveedor] ?? '').trim() || undefined : undefined
    filas.push({ codigo, descripcion, cantidadPedida: Math.round(cantidad), codigoBarra, lpn, tienda, skuProveedor })
  }

  if (filas.length === 0) errores.push('No se encontraron filas válidas en el archivo')

  return { filas, errores }
}
