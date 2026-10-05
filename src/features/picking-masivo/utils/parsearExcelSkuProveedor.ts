import * as XLSX from 'xlsx'

export type ItemSkuProveedor = { codigo: string; skuProveedor: string }

function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const ALIAS_CODIGO        = ['vin', 'codigo producto', 'codigo', 'cod']
const ALIAS_SKU_PROVEEDOR = ['sku']

export async function parsearExcelSkuProveedor(file: File): Promise<{ items: ItemSkuProveedor[]; error?: string }> {
  const buffer = await file.arrayBuffer()
  const wb     = XLSX.read(buffer, { type: 'array', cellText: true })
  const ws     = wb.Sheets[wb.SheetNames[0]]
  const data   = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null, raw: false })

  const primeraFila = data.find(f => f.some(c => c !== null && c !== ''))
  if (!primeraFila) return { items: [], error: 'El archivo está vacío' }

  const encabezados = primeraFila.map(c => String(c ?? '').trim())
  const norm        = encabezados.map(normalizar)

  const encontrar = (alias: string[]) => {
    for (const a of alias) {
      const idx = norm.findIndex(h => h === a || h.startsWith(a + ' ') || h.startsWith(a + '('))
      if (idx !== -1) return idx
    }
    return -1
  }

  const idxCodigo = encontrar(ALIAS_CODIGO)
  const idxSku    = encontrar(ALIAS_SKU_PROVEEDOR)

  if (idxCodigo === -1) return { items: [], error: 'No se encontró columna de código interno (VIN)' }
  if (idxSku    === -1) return { items: [], error: 'No se encontró columna SKU proveedor' }
  if (idxSku === idxCodigo) return { items: [], error: 'Las columnas SKU y código interno son la misma' }

  const filasDatos = data.slice(data.indexOf(primeraFila) + 1).filter(f => f.some(c => c !== null && c !== ''))
  const items: ItemSkuProveedor[] = []

  for (const fila of filasDatos) {
    const codigo       = String(fila[idxCodigo] ?? '').trim()
    const skuProveedor = String(fila[idxSku]    ?? '').trim()
    if (codigo && skuProveedor) items.push({ codigo, skuProveedor })
  }

  if (items.length === 0) return { items: [], error: 'No se encontraron filas con código y SKU válidos' }
  return { items }
}
