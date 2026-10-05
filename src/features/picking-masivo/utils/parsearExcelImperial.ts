import * as XLSX from 'xlsx'
import type { OrdenConstrumart, LineaConstrumart } from './parsearExcelConstrumart'

export type ResultadoParseImperial = {
  ordenes:     OrdenConstrumart[]
  totalLineas: number
  errores:     string[]
}

type Celda = string | number | boolean | null

function norm(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function encontrar(headers: string[], objetivo: string): number {
  const n = norm(objetivo)
  return headers.findIndex(h => norm(h) === n)
}

function strCell(fila: Celda[], idx: number): string {
  if (idx === -1) return ''
  const v = fila[idx]
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v))
  return String(v).trim().replace(/\.0$/, '')
}

function numCell(fila: Celda[], idx: number): number {
  if (idx === -1) return NaN
  const v = fila[idx]
  if (typeof v === 'number') return v
  if (v === null || v === undefined) return NaN
  const s = String(v).trim().replace(/\./g, '').replace(',', '.')
  return parseFloat(s)
}

export async function parsearExcelImperial(file: File): Promise<ResultadoParseImperial> {
  const errores: string[] = []
  const buffer = await file.arrayBuffer()
  const wb     = XLSX.read(buffer, { type: 'array', cellDates: false })
  const ws     = wb.Sheets[wb.SheetNames[0]]
  const data   = XLSX.utils.sheet_to_json<Celda[]>(ws, { header: 1, defval: null, raw: true })

  const headerRow = data.find(f => f.some(c => c !== null && c !== ''))
  if (!headerRow) {
    return { ordenes: [], totalLineas: 0, errores: ['El archivo está vacío'] }
  }

  const headers    = headerRow.map(c => String(c ?? '').trim())
  const filasDatos = data
    .slice(data.indexOf(headerRow) + 1)
    .filter(f => f.some(c => c !== null && c !== ''))

  const idx = {
    oc:          encontrar(headers, 'oc'),
    tienda:      encontrar(headers, 'tienda'),
    ean13:       encontrar(headers, 'ean13'),
    codProv:     encontrar(headers, 'cod proveedor'),
    cantidad:    encontrar(headers, 'cantidad'),
    lpn:         encontrar(headers, 'lpn'),
  }

  const faltantes = (Object.entries(idx) as [string, number][])
    .filter(([, v]) => v === -1)
    .map(([k]) => k)

  if (faltantes.length > 0) {
    errores.push(
      `Columnas no encontradas: ${faltantes.join(', ')}. ` +
      `Verifica que el archivo sea el formato Imperial correcto.`
    )
    return { ordenes: [], totalLineas: 0, errores }
  }

  const mapaOrdenes = new Map<string, OrdenConstrumart & { _lineasCount: number }>()
  let filaNum = data.indexOf(headerRow) + 2
  let totalLineas = 0

  for (const fila of filasDatos) {
    filaNum++

    const oc       = strCell(fila, idx.oc)
    const tienda   = strCell(fila, idx.tienda)
    const ean13    = strCell(fila, idx.ean13)
    const codProv  = strCell(fila, idx.codProv)
    const cantidad = numCell(fila, idx.cantidad)
    const lpn      = strCell(fila, idx.lpn)

    if (!oc) { errores.push(`Fila ${filaNum}: OC vacío, se omite`); continue }
    if (!lpn) { errores.push(`Fila ${filaNum}: LPN vacío en OC ${oc}, se omite`); continue }
    if (!ean13) { errores.push(`Fila ${filaNum}: EAN13 vacío en OC ${oc} / LPN ${lpn}, se omite`); continue }
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      errores.push(`Fila ${filaNum}: Cantidad inválida en OC ${oc} / LPN ${lpn}, se omite`)
      continue
    }

    if (!mapaOrdenes.has(oc)) {
      mapaOrdenes.set(oc, { numeroOrden: oc, numeroGuia: '', lineas: [], _lineasCount: 0 })
    }
    const orden = mapaOrdenes.get(oc)!
    orden._lineasCount++

    const linea: LineaConstrumart = {
      lpn,
      posicionOrden:      orden._lineasCount,
      codigoBarra:        ean13,
      codigoProveedor:    '',
      skuProveedor:       codProv,
      tienda,
      cantidadSolicitada: Math.round(cantidad),
    }

    orden.lineas.push(linea)
    totalLineas++
  }

  if (totalLineas === 0) {
    errores.push('No se encontraron filas válidas en el archivo')
  }

  const ordenes = Array.from(mapaOrdenes.values()).map(({ _lineasCount: _, ...o }) => o)

  return { ordenes, totalLineas, errores }
}
